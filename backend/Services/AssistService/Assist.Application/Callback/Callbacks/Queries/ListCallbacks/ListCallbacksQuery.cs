using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Queries.ListCallbacks;

/// <summary>
/// Returns a paginated list of callbacks with optional filters.
/// Org-level filter is enforced from the API layer (P6-HANDOFF-04).
/// </summary>
public record ListCallbacksQuery(
    Guid? UserId = null,
    Guid? OrganizationId = null,
    Guid? AgentId = null,
    CallbackStatus? Status = null,
    CallbackCategory? Category = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListCallbacksDto>;

/// <summary>Paginated callback list DTO.</summary>
public record ListCallbacksDto(IReadOnlyList<CallbackSummaryDto> Items, int TotalCount);

/// <summary>Summary row for a callback list.</summary>
public record CallbackSummaryDto(
    Guid Id,
    Guid? UserId,
    CallbackStatus Status,
    CallbackCategory Category,
    CallbackPriority Priority,
    Guid? AssignedAgentId,
    DateTime? ScheduledAt,
    string PhoneNumber,
    DateTime CreatedAt);

/// <summary>Validates the list query.</summary>
public sealed class ListCallbacksQueryValidator : AbstractValidator<ListCallbacksQuery>
{
    public ListCallbacksQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>Handles <see cref="ListCallbacksQuery"/>.</summary>
public sealed class ListCallbacksQueryHandler(ICallbackDbContext dbContext)
    : IQueryHandler<ListCallbacksQuery, ListCallbacksDto>
{
    /// <inheritdoc />
    public async Task<Result<ListCallbacksDto>> Handle(
        ListCallbacksQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Callbacks.Where(c => c.DeletedAt == null);

        if (request.UserId.HasValue)
            query = query.Where(c => c.UserId == (Guid?)request.UserId.Value);
        if (request.OrganizationId.HasValue)
            query = query.Where(c => c.OrganizationId == request.OrganizationId.Value);
        if (request.AgentId.HasValue)
            query = query.Where(c => c.AssignedAgentId == request.AgentId.Value);
        if (request.Status.HasValue)
            query = query.Where(c => c.Status == request.Status.Value);
        if (request.Category.HasValue)
            query = query.Where(c => c.Category == request.Category.Value);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(c => new CallbackSummaryDto(
                c.Id, c.UserId, c.Status, c.Category, c.Priority,
                c.AssignedAgentId, c.ScheduledAt, c.PhoneNumber, c.CreatedAt))
            .ToListAsync(cancellationToken);

        return new ListCallbacksDto(items, total);
    }
}
