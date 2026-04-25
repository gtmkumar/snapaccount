using FluentValidation;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Queries.GetDlq;

/// <summary>
/// Returns paginated DLQ items for operator review.
/// SEC-028: requires notification.dlq.manage permission (operator role only).
/// </summary>
[RequiresPermission("notification.dlq.manage")]
public record GetDlqQuery(bool IncludeResolved = false, int Page = 1, int PageSize = 50) : IQuery<DlqDto>;

/// <summary>DLQ list DTO.</summary>
public record DlqDto(IReadOnlyList<DlqItemSummary> Items, int TotalCount);

/// <summary>One DLQ item summary.</summary>
public record DlqItemSummary(
    Guid Id,
    Guid? UserId,
    string EventCode,
    NotificationChannel Channel,
    string Locale,
    string LastErrorMessage,
    int RetryCount,
    DateTime ExhaustedAt,
    bool IsResolved);

/// <summary>Validates the DLQ query.</summary>
public sealed class GetDlqQueryValidator : AbstractValidator<GetDlqQuery>
{
    public GetDlqQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

/// <summary>Handles <see cref="GetDlqQuery"/>.</summary>
public sealed class GetDlqQueryHandler(INotificationDbContext dbContext)
    : IQueryHandler<GetDlqQuery, DlqDto>
{
    /// <inheritdoc />
    public async Task<Result<DlqDto>> Handle(GetDlqQuery request, CancellationToken cancellationToken)
    {
        var query = dbContext.DlqItems.Where(d => d.DeletedAt == null);
        if (!request.IncludeResolved) query = query.Where(d => !d.IsResolved);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(d => d.ExhaustedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(d => new DlqItemSummary(
                d.Id, d.UserId, d.EventCode, d.Channel, d.Locale,
                d.LastErrorMessage, d.RetryCount, d.ExhaustedAt, d.IsResolved))
            .ToListAsync(cancellationToken);

        return new DlqDto(items, total);
    }
}
