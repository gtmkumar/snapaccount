using FluentValidation;
using NotificationService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.MarkRead;

/// <summary>
/// Marks a single in-app inbox notification as read.
/// DG-NOTIF-04: now operates on <c>InboxNotifications</c> (notification.notification)
/// instead of the stale NotificationLog query which found nothing.
/// No special permission required — any authenticated user may mark their own inbox.
/// </summary>
public record MarkReadCommand(Guid NotificationId, Guid UserId) : ICommand;

/// <summary>Validates the mark-read command.</summary>
public sealed class MarkReadCommandValidator : AbstractValidator<MarkReadCommand>
{
    public MarkReadCommandValidator()
    {
        RuleFor(x => x.NotificationId).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
    }
}

/// <summary>Handles <see cref="MarkReadCommand"/>.</summary>
public sealed class MarkReadCommandHandler(INotificationDbContext dbContext)
    : ICommandHandler<MarkReadCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(MarkReadCommand request, CancellationToken cancellationToken)
    {
        var entry = await dbContext.InboxNotifications
            .FirstOrDefaultAsync(
                n => n.Id == request.NotificationId
                  && n.UserId == request.UserId
                  && n.DeletedAt == null,
                cancellationToken);

        if (entry is null)
            return Result.Failure(Error.NotFound("Notification.NotFound",
                $"Inbox notification {request.NotificationId} not found for this user."));

        entry.MarkAsRead();
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
