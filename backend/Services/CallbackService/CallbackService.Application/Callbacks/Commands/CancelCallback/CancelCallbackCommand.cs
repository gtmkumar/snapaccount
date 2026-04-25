using CallbackService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.CancelCallback;

/// <summary>
/// Cancels a callback request.
/// SEC-026: requires callback.cancel permission.
/// </summary>
[RequiresPermission("callback.cancel")]
public record CancelCallbackCommand(Guid CallbackId, string? Reason) : ICommand;

/// <summary>Validates the cancel command.</summary>
public sealed class CancelCallbackCommandValidator : AbstractValidator<CancelCallbackCommand>
{
    public CancelCallbackCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500).When(x => x.Reason is not null);
    }
}

/// <summary>
/// Handles <see cref="CancelCallbackCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// </summary>
public sealed class CancelCallbackCommandHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<CancelCallbackCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(CancelCallbackCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        try { callback.Cancel(request.Reason); }
        catch (InvalidOperationException ex)
        { return Result.Failure(Error.Validation("Callback.InvalidTransition", ex.Message)); }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
