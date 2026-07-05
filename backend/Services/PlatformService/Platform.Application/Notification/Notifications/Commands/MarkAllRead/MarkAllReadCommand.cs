using FluentValidation;
using NotificationService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.MarkAllRead;

/// <summary>
/// Marks all unread in-app inbox notifications for the calling user as read.
/// DG-NOTIF-04: maps to POST /notifications/read-all (called by admin notification center).
/// No special permission required — any authenticated user may mark their own inbox.
/// </summary>
public record MarkAllReadCommand(Guid UserId) : ICommand<MarkAllReadResult>;

/// <summary>Result returned to the caller.</summary>
public record MarkAllReadResult(int MarkedCount);

/// <summary>Validates the mark-all-read command.</summary>
public sealed class MarkAllReadCommandValidator : AbstractValidator<MarkAllReadCommand>
{
    public MarkAllReadCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
    }
}

/// <summary>Handles <see cref="MarkAllReadCommand"/>.</summary>
public sealed class MarkAllReadCommandHandler(INotificationDbContext dbContext)
    : ICommandHandler<MarkAllReadCommand, MarkAllReadResult>
{
    /// <inheritdoc />
    public async Task<Result<MarkAllReadResult>> Handle(
        MarkAllReadCommand request,
        CancellationToken cancellationToken)
    {
        var unread = await dbContext.InboxNotifications
            .Where(n => n.UserId == request.UserId
                     && !n.IsRead
                     && n.DeletedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var notification in unread)
            notification.MarkAsRead();

        await dbContext.SaveChangesAsync(cancellationToken);

        return new MarkAllReadResult(unread.Count);
    }
}
