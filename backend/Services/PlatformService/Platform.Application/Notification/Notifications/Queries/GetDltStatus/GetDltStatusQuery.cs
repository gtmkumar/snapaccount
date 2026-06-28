using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Queries.GetDltStatus;

/// <summary>
/// DG-NOTIF-07: Returns DLT registration status for all SMS templates.
/// Shows which event×locale combinations are SMS-enabled but missing a DLT
/// template ID (which causes the SMS gate in <see cref="SendNotificationCommandHandler"/>
/// to suppress 100% of SMS for that template).
///
/// Operators use this to identify which templates need TRAI DLT portal
/// registration before SMS can be dispatched in production.
///
/// RBAC: requires notification.templates.manage (admin-only).
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record GetDltStatusQuery : IQuery<GetDltStatusResponse>;

/// <summary>DLT registration status for a single SMS template.</summary>
public record DltStatusItem(
    Guid TemplateId,
    string EventCode,
    string Locale,
    bool IsCurrent,
    string? DltTemplateId,
    bool IsRegistered,
    bool IsDevPlaceholder,
    DateTime UpdatedAt);

/// <summary>Summary of DLT registration coverage across all SMS templates.</summary>
public record GetDltStatusResponse(
    IReadOnlyList<DltStatusItem> Items,
    int TotalSmsTemplates,
    int RegisteredCount,
    int UnregisteredCount,
    int DevPlaceholderCount,
    bool HasUnregisteredCurrentTemplates);

/// <summary>
/// DG-NOTIF-07: Handles GetDltStatusQuery.
/// Only returns SMS-channel templates; other channels are not DLT-regulated.
/// </summary>
public sealed class GetDltStatusQueryHandler(
    INotificationDbContext db) : IQueryHandler<GetDltStatusQuery, GetDltStatusResponse>
{
    // Dev placeholder DLT ID seeded in non-production environments.
    // Real TRAI-registered IDs are 19-digit numeric strings; this string is
    // deliberately recognisable so operators can identify dev rows at a glance.
    private const string DevPlaceholderId = "DEV_PLACEHOLDER_DLT_ID";

    /// <inheritdoc />
    public async Task<Result<GetDltStatusResponse>> Handle(
        GetDltStatusQuery request,
        CancellationToken cancellationToken)
    {
        var smsCurrent = await db.NotificationTemplates
            .Where(t => t.Channel == NotificationChannel.Sms && t.DeletedAt == null)
            .OrderBy(t => t.EventCode)
            .ThenBy(t => t.Locale)
            .ThenByDescending(t => t.IsCurrent)
            .Select(t => new
            {
                t.Id,
                t.EventCode,
                t.Locale,
                t.IsCurrent,
                t.DltTemplateId,
                t.UpdatedAt
            })
            .ToListAsync(cancellationToken);

        var items = smsCurrent
            .Select(t => new DltStatusItem(
                t.Id,
                t.EventCode,
                t.Locale,
                t.IsCurrent,
                t.DltTemplateId,
                IsRegistered: !string.IsNullOrEmpty(t.DltTemplateId),
                IsDevPlaceholder: t.DltTemplateId == DevPlaceholderId,
                t.UpdatedAt))
            .ToList();

        var currentItems = items.Where(i => i.IsCurrent).ToList();
        var registered = items.Count(i => i.IsRegistered);
        var devPlaceholder = items.Count(i => i.IsDevPlaceholder);
        var unregistered = items.Count - registered;
        var hasUnregisteredCurrent = currentItems.Any(i => !i.IsRegistered);

        return Result<GetDltStatusResponse>.Success(new GetDltStatusResponse(
            items,
            TotalSmsTemplates: items.Count,
            RegisteredCount: registered,
            UnregisteredCount: unregistered,
            DevPlaceholderCount: devPlaceholder,
            HasUnregisteredCurrentTemplates: hasUnregisteredCurrent));
    }
}
