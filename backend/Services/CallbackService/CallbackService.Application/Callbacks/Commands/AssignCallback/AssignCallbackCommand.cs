using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.AssignCallback;

/// <summary>
/// Assigns an agent to a pending callback request.
/// SEC-026: requires callback.assign permission (operator/agent role only).
/// SEC-030: writes a <see cref="AssignmentLog"/> audit row on every assignment.
/// </summary>
[RequiresPermission("callback.assign")]
public record AssignCallbackCommand(Guid CallbackId, Guid AgentId, string? Reason = null) : ICommand;

/// <summary>Validates the assign command.</summary>
public sealed class AssignCallbackCommandValidator : AbstractValidator<AssignCallbackCommand>
{
    public AssignCallbackCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.AgentId).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}

/// <summary>
/// Handles <see cref="AssignCallbackCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// SEC-030: persists an <c>callback.assignments_log</c> audit row.
/// </summary>
public sealed class AssignCallbackCommandHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<AssignCallbackCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(AssignCallbackCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound (not Forbidden) to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        var fromAgentId = callback.AssignedAgentId;

        try { callback.Assign(request.AgentId); }
        catch (InvalidOperationException ex)
        { return Result.Failure(Error.Validation("Callback.InvalidTransition", ex.Message)); }

        // SEC-030: append to callback.assignments_log within the same SaveChanges
        // so the audit row commits atomically with the state mutation.
        dbContext.AssignmentLogs.Add(AssignmentLog.Create(
            callbackId: callback.Id,
            fromUserId: fromAgentId,
            toUserId: request.AgentId,
            assignedBy: currentUser.UserId,
            reason: request.Reason));

        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
