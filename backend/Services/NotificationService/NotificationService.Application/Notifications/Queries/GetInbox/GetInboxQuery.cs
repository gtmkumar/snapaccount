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
        var query = dbContext.NotificationLog
            .Where(l => l.UserId == request.UserId
                     && l.Channel == NotificationChannel.InApp
                     && l.DeletedAt == null);

        var total = await query.CountAsync(cancellationToken);
        var unread = await query.CountAsync(l => l.Status == DispatchStatus.Sent, cancellationToken);

        var items = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(l => new InboxItem(l.Id, l.EventCode, l.RenderedBody, l.Status, l.CreatedAt))
            .ToListAsync(cancellationToken);

        return new InboxDto(items, total, unread);
    }
}
