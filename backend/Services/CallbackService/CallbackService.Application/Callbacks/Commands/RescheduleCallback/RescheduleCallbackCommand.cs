using CallbackService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.RescheduleCallback;

/// <summary>Reschedules a callback to a new preferred time window.</summary>
public record RescheduleCallbackCommand(
    Guid CallbackId,
    DateTime NewWindowStart,
    DateTime NewWindowEnd) : ICommand;

/// <summary>Validates the reschedule command.</summary>
public sealed class RescheduleCallbackCommandValidator : AbstractValidator<RescheduleCallbackCommand>
{
    public RescheduleCallbackCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.NewWindowStart).GreaterThan(DateTime.UtcNow)
            .WithMessage("New window start must be in the future.");
        RuleFor(x => x.NewWindowEnd).GreaterThan(x => x.NewWindowStart)
            .WithMessage("New window end must be after start.");
    }
}

/// <summary>
/// Handles <see cref="RescheduleCallbackCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// </summary>
public sealed class RescheduleCallbackCommandHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<RescheduleCallbackCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RescheduleCallbackCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        try { callback.Reschedule(request.NewWindowStart, request.NewWindowEnd); }
        catch (InvalidOperationException ex)
        { return Result.Failure(Error.Validation("Callback.InvalidTransition", ex.Message)); }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
