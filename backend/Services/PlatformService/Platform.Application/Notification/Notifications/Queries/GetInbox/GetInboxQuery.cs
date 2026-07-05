using FluentValidation;
using NotificationService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace NotificationService.Application.Notifications.Queries.GetInbox;

/// <summary>
/// Returns paginated in-app notification inbox for a user.
/// DG-NOTIF-04: added category + unreadOnly filters; DTO extended with
/// title, category, status as READ|UNREAD, deepLinkUrl and linkedEntity fields.
/// </summary>
public record GetInboxQuery(
    Guid UserId,
    int Page = 1,
    int PageSize = 20,
    string? Category = null,
    bool? UnreadOnly = null) : IQuery<InboxDto>;

/// <summary>Paginated inbox DTO.</summary>
public record InboxDto(IReadOnlyList<InboxItem> Items, int TotalCount, int UnreadCount);

/// <summary>
/// One inbox notification item.
/// <c>Status</c> is READ or UNREAD (derived from <c>IsRead</c>), not the dispatch status.
/// </summary>
public record InboxItem(
    Guid Id,
    string EventCode,
    string? Category,
    string Title,
    string Body,
    /// <summary>READ or UNREAD — matches the frontend NotificationStatusEnum.</summary>
    string Status,
    DateTime SentAt,
    string? DeepLinkUrl,
    string? DeepLinkLabel,
    string? LinkedEntityType,
    string? LinkedEntityId,
    string? LinkedEntityLabel);

/// <summary>Validates the inbox query.</summary>
public sealed class GetInboxQueryValidator : AbstractValidator<GetInboxQuery>
{
    public GetInboxQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>Handles <see cref="GetInboxQuery"/>.</summary>
public sealed class GetInboxQueryHandler(INotificationDbContext dbContext)
    : IQueryHandler<GetInboxQuery, InboxDto>
{
    /// <summary>JSON options for deserializing data_payload JSONB.</summary>
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    /// <inheritdoc />
    public async Task<Result<InboxDto>> Handle(GetInboxQuery request, CancellationToken cancellationToken)
    {
        // Build a category→event-code map from the catalog for filtering.
        // Keyed lowercase to match the frontend enum (GST, ITR, DOCS, LOAN, CALLBACK, BILLING, SYSTEM).
        // DOCS covers DOCUMENT category in the catalog.
        var categoryToPrefix = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["GST"]      = "GST_",
            ["ITR"]      = "ITR_",
            ["DOCS"]     = "DOC_",
            ["LOAN"]     = "LOAN_",
            ["CALLBACK"] = "CB_",
            ["BILLING"]  = "SUB_",
            ["SYSTEM"]   = "ACCT_",
        };

        var query = dbContext.InboxNotifications
            .Where(n => n.UserId == request.UserId && n.DeletedAt == null);

        // DG-NOTIF-04: category filter — match event_type prefix.
        if (!string.IsNullOrWhiteSpace(request.Category)
            && categoryToPrefix.TryGetValue(request.Category, out var prefix))
        {
            query = query.Where(n => n.EventType.StartsWith(prefix));
        }

        // DG-NOTIF-04: unreadOnly filter.
        if (request.UnreadOnly == true)
            query = query.Where(n => !n.IsRead);

        var total = await query.CountAsync(cancellationToken);
        var unread = await query.CountAsync(n => !n.IsRead, cancellationToken);

        var rows = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(n => new
            {
                n.Id,
                n.EventType,
                n.Title,
                n.Body,
                n.IsRead,
                n.CreatedAt,
                n.ReferenceType,
                n.ReferenceId,
                n.DataPayload
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(n =>
        {
            // Derive category from event-type prefix.
            var category = DeriveCategory(n.EventType);

            // Status = READ or UNREAD (not dispatch status).
            var status = n.IsRead ? "READ" : "UNREAD";

            // Deserialize data_payload for deep-link info.
            string? deepLinkUrl = null;
            string? deepLinkLabel = null;
            string? linkedEntityLabel = null;
            if (!string.IsNullOrWhiteSpace(n.DataPayload))
            {
                try
                {
                    var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(n.DataPayload, JsonOpts);
                    if (payload is not null)
                    {
                        deepLinkUrl       = payload.TryGetValue("deepLinkUrl",       out var dlu)  ? dlu.GetString()  : null;
                        deepLinkLabel     = payload.TryGetValue("deepLinkLabel",     out var dll)  ? dll.GetString()  : null;
                        linkedEntityLabel = payload.TryGetValue("linkedEntityLabel", out var lel)  ? lel.GetString()  : null;
                    }
                }
                catch
                {
                    // Malformed JSON is non-fatal — surface the notification without deep-link.
                }
            }

            return new InboxItem(
                n.Id,
                n.EventType,
                category,
                string.IsNullOrWhiteSpace(n.Title) ? n.Body : n.Title,
                n.Body,
                status,
                n.CreatedAt,
                deepLinkUrl,
                deepLinkLabel,
                n.ReferenceType,
                n.ReferenceId?.ToString(),
                linkedEntityLabel);
        }).ToList();

        return new InboxDto(items, total, unread);
    }

    private static string? DeriveCategory(string eventType) => eventType switch
    {
        _ when eventType.StartsWith("GST_")  => "GST",
        _ when eventType.StartsWith("ITR_")  => "ITR",
        _ when eventType.StartsWith("DOC_")  => "DOCS",
        _ when eventType.StartsWith("LOAN_") => "LOAN",
        _ when eventType.StartsWith("CB_")   => "CALLBACK",
        _ when eventType.StartsWith("SUB_")  => "BILLING",
        _ when eventType.StartsWith("ACCT_") => "SYSTEM",
        _ when eventType.StartsWith("CHAT_") => "SYSTEM",
        _ => null
    };
}
