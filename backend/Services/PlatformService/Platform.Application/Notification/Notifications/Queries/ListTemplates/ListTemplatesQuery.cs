using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Queries.ListTemplates;

/// <summary>
/// Lists notification templates, optionally filtered by event_code or channel.
/// Admin permission required.
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record ListTemplatesQuery(
    string? EventCode = null,
    NotificationChannel? Channel = null,
    string? Locale = null,
    int Page = 1,
    int PageSize = 50) : IQuery<ListTemplatesResponse>;

/// <summary>A single template summary.</summary>
public record TemplateSummaryDto(
    Guid Id,
    string Code,
    string Name,
    string EventCode,
    string Channel,
    string Locale,
    string? Subject,
    string Body,
    bool IsCurrent,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    DateTime UpdatedAt);

/// <summary>Paginated templates response.</summary>
public record ListTemplatesResponse(
    IReadOnlyList<TemplateSummaryDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Validates ListTemplatesQuery.</summary>
public sealed class ListTemplatesQueryValidator : AbstractValidator<ListTemplatesQuery>
{
    public ListTemplatesQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

/// <summary>Handles ListTemplatesQuery — returns all templates matching filters.</summary>
public sealed class ListTemplatesQueryHandler(
    INotificationDbContext db) : IQueryHandler<ListTemplatesQuery, ListTemplatesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListTemplatesResponse>> Handle(
        ListTemplatesQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.NotificationTemplates.AsQueryable();

        if (!string.IsNullOrEmpty(request.EventCode))
            query = query.Where(t => t.EventCode == request.EventCode);

        if (request.Channel.HasValue)
            query = query.Where(t => t.Channel == request.Channel.Value);

        if (!string.IsNullOrEmpty(request.Locale))
            query = query.Where(t => t.Locale == request.Locale);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(t => t.EventCode)
            .ThenBy(t => t.Channel)
            .ThenBy(t => t.Locale)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(t => new TemplateSummaryDto(
                t.Id,
                t.Code,
                t.Name,
                t.EventCode,
                t.Channel.ToString(),
                t.Locale,
                t.Subject,
                t.Body,
                t.IsCurrent,
                t.EffectiveFrom,
                t.EffectiveTo,
                t.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Result<ListTemplatesResponse>.Success(new ListTemplatesResponse(items, total, request.Page, request.PageSize));
    }
}
