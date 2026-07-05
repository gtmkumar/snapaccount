using CallbackService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.CompleteCallback;

/// <summary>
/// Marks a callback as completed after the call.
/// SEC-026: requires callback.complete permission (agent role only).
/// </summary>
[RequiresPermission("callback.complete")]
public record CompleteCallbackCommand(Guid CallbackId, string? ResolutionSummary) : ICommand;

/// <summary>Validates the complete command.</summary>
public sealed class CompleteCallbackCommandValidator : AbstractValidator<CompleteCallbackCommand>
{
    public CompleteCallbackCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.ResolutionSummary).MaximumLength(2000).When(x => x.ResolutionSummary is not null);
    }
}

/// <summary>
/// Handles <see cref="CompleteCallbackCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// </summary>
public sealed class CompleteCallbackCommandHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<CompleteCallbackCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(CompleteCallbackCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        try { callback.Complete(request.ResolutionSummary); }
        catch (InvalidOperationException ex)
        { return Result.Failure(Error.Validation("Callback.InvalidTransition", ex.Message)); }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
