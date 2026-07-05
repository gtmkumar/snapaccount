using FluentValidation;
using MediatR;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Notifications.Commands.SendNotification;
using NotificationService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.RetryDlqItem;

/// <summary>
/// Retries a DLQ item by re-dispatching via the fan-out pipeline.
/// SEC-028: requires notification.dlq.manage permission (operator role only).
/// </summary>
[RequiresPermission("notification.dlq.manage")]
public record RetryDlqItemCommand(Guid DlqItemId) : ICommand;

/// <summary>Validates the retry command.</summary>
public sealed class RetryDlqItemCommandValidator : AbstractValidator<RetryDlqItemCommand>
{
    public RetryDlqItemCommandValidator()
    {
        RuleFor(x => x.DlqItemId).NotEmpty();
    }
}

/// <summary>Handles <see cref="RetryDlqItemCommand"/>.</summary>
public sealed class RetryDlqItemCommandHandler(INotificationDbContext dbContext, ISender sender)
    : ICommandHandler<RetryDlqItemCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RetryDlqItemCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.DlqItems
            .FirstOrDefaultAsync(d => d.Id == request.DlqItemId && !d.IsResolved, cancellationToken);

        if (item is null)
            return Result.Failure(Error.NotFound("DlqItem", request.DlqItemId));

        if (item.UserId is null)
            return Result.Failure(Error.Validation("DlqItem.NoUser", "Cannot retry DLQ item with no user ID."));

        // Re-dispatch via fan-out with empty variables (original payload is stored as rendered text)
        var retryCommand = new SendNotificationCommand(
            item.UserId.Value,
            item.EventCode,
            item.Locale,
            new Dictionary<string, string>());

        var result = await sender.Send(retryCommand, cancellationToken);
        if (result.IsSuccess && result.Value.DispatchedCount > 0)
        {
            item.Resolve();
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return result.IsSuccess ? Result.Success() : Result.Failure(result.Error);
    }
}
