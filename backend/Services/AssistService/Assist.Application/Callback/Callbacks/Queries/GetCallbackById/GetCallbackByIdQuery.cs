using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Queries.GetCallbackById;

/// <summary>
/// Returns a single callback with its notes.
/// SEC-029: scoped to the caller's organization to prevent IDOR.
/// </summary>
public record GetCallbackByIdQuery(Guid CallbackId) : IQuery<CallbackDetailDto>;

/// <summary>Full callback detail DTO.</summary>
public record CallbackDetailDto(
    Guid Id,
    Guid? UserId,
    Guid? OrganizationId,
    CallbackStatus Status,
    CallbackCategory Category,
    CallbackPriority Priority,
    Guid? AssignedAgentId,
    DateTime? PreferredWindowStart,
    DateTime? PreferredWindowEnd,
    DateTime? ScheduledAt,
    DateTime? CompletedAt,
    string? IssueDescription,
    string? ResolutionSummary,
    string PhoneNumber,
    string? EscalationReason,
    string? CancellationReason,
    int RescheduleCount,
    DateTime CreatedAt,
    IReadOnlyList<CallNoteDto> Notes);

/// <summary>DTO for a single call note.</summary>
public record CallNoteDto(Guid Id, Guid AuthorId, string Content, bool IsInternal, DateTime CreatedAt);

/// <summary>Validates the query.</summary>
public sealed class GetCallbackByIdQueryValidator : AbstractValidator<GetCallbackByIdQuery>
{
    public GetCallbackByIdQueryValidator() => RuleFor(x => x.CallbackId).NotEmpty();
}

/// <summary>
/// Handles <see cref="GetCallbackByIdQuery"/>.
/// SEC-029: filters by organization_id in the EF query to prevent IDOR —
/// a cross-org request returns 404 (NotFound) to avoid existence leak.
/// </summary>
public sealed class GetCallbackByIdQueryHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<GetCallbackByIdQuery, CallbackDetailDto>
{
    /// <inheritdoc />
    public async Task<Result<CallbackDetailDto>> Handle(
        GetCallbackByIdQuery request,
        CancellationToken cancellationToken)
    {
        // SEC-029: Always scope to caller's org — never fetch-then-check.
        var orgId = currentUser.OrganizationId;

        var cb = await dbContext.Callbacks
            .Include(c => c.Notes)
            .FirstOrDefaultAsync(
                c => c.Id == request.CallbackId
                     && c.DeletedAt == null
                     && (orgId == null || c.OrganizationId == orgId),
                cancellationToken);

        if (cb is null)
            return Result<CallbackDetailDto>.Failure(Error.NotFound("Callback", request.CallbackId));

        var notes = cb.Notes
            .Where(n => n.DeletedAt == null)
            .OrderBy(n => n.CreatedAt)
            .Select(n => new CallNoteDto(n.Id, n.AuthorId, n.Content, n.IsInternal, n.CreatedAt))
            .ToList();

        return new CallbackDetailDto(
            cb.Id, cb.UserId, cb.OrganizationId, cb.Status, cb.Category, cb.Priority,
            cb.AssignedAgentId, cb.PreferredWindowStart, cb.PreferredWindowEnd,
            cb.ScheduledAt, cb.CompletedAt, cb.IssueDescription, cb.ResolutionSummary,
            cb.PhoneNumber, cb.EscalationReason, cb.CancellationReason, cb.RescheduleCount,
            cb.CreatedAt, notes);
    }
}
