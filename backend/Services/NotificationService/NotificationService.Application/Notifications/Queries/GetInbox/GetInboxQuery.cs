using FluentValidation;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Queries.GetInbox;

/// <summary>Returns paginated in-app notification inbox for a user.</summary>
public record GetInboxQuery(Guid UserId, int Page = 1, int PageSize = 20) : IQuery<InboxDto>;

/// <summary>Paginated inbox DTO.</summary>
public record InboxDto(IReadOnlyList<InboxItem> Items, int TotalCount, int UnreadCount);

/// <summary>One inbox notification item.</summary>
public record InboxItem(
    Guid Id,
    string EventCode,
    string Body,
    DispatchStatus Status,
    DateTime SentAt);

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
    /// <inheritdoc />
    public async Task<Result<InboxDto>> Handle(GetInboxQuery request, CancellationToken cancellationToken)
    {
        // Reads the real in-app inbox table (notification.notification) via the InboxNotification
        // read model. Unread = not yet marked read.
        var query = dbContext.InboxNotifications
            .Where(n => n.UserId == request.UserId && n.DeletedAt == null);

        var total = await query.CountAsync(cancellationToken);
        var unread = await query.CountAsync(n => !n.IsRead, cancellationToken);

        var rows = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(n => new { n.Id, n.EventType, n.Title, n.Body, n.Status, n.CreatedAt })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(n => new InboxItem(
                n.Id,
                n.EventType,
                string.IsNullOrWhiteSpace(n.Body) ? n.Title : n.Body,
                Enum.TryParse<DispatchStatus>(n.Status, ignoreCase: true, out var s) ? s : DispatchStatus.Sent,
                n.CreatedAt))
            .ToList();

        return new InboxDto(items, total, unread);
    }
}
