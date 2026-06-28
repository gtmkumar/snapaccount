using CallbackService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Microsoft.Extensions.Logging;

namespace CallbackService.Application.Callbacks.Commands.ConfirmCallback;

/// <summary>Confirms a scheduled time for an assigned callback.</summary>
public record ConfirmCallbackCommand(Guid CallbackId, DateTime ScheduledAt) : ICommand;

/// <summary>Validates the confirm command.</summary>
public sealed class ConfirmCallbackCommandValidator : AbstractValidator<ConfirmCallbackCommand>
{
    public ConfirmCallbackCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.ScheduledAt).GreaterThan(DateTime.UtcNow)
            .WithMessage("ScheduledAt must be in the future.");
    }
}

/// <summary>
/// Handles <see cref="ConfirmCallbackCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// DG-NOTIF-01: publishes a CB_SCHEDULED notification to the customer on confirmation.
/// </summary>
public sealed class ConfirmCallbackCommandHandler(
    ICallbackDbContext dbContext,
    ICurrentUser currentUser,
    ILogger<ConfirmCallbackCommandHandler> logger,
    ICallbackEventPublisher? callbackEventPublisher = null)
    : ICommandHandler<ConfirmCallbackCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(ConfirmCallbackCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        try { callback.Confirm(request.ScheduledAt); }
        catch (InvalidOperationException ex)
        { return Result.Failure(Error.Validation("Callback.InvalidTransition", ex.Message)); }

        await dbContext.SaveChangesAsync(cancellationToken);

        // DG-NOTIF-01: publish CB_SCHEDULED notification to the customer.
        // Optional publisher — null in tests or local dev without GCP credentials.
        if (callbackEventPublisher is not null && callback.UserId.HasValue)
        {
            try
            {
                await callbackEventPublisher.PublishCallbackScheduledAsync(
                    callbackId: callback.Id,
                    userId: callback.UserId.Value,
                    scheduledAt: request.ScheduledAt,
                    ct: cancellationToken);
            }
            catch (Exception ex)
            {
                // Fire-and-forget: notification failure must not fail the confirmation.
                logger.LogWarning(ex,
                    "ConfirmCallbackCommandHandler: notification publish failed for callback {CallbackId}",
                    callback.Id);
            }
        }

        return Result.Success();
    }
}
