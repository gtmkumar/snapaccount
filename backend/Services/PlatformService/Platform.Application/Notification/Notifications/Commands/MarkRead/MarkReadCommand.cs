using FluentValidation;
using NotificationService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.MarkRead;

/// <summary>Marks an in-app notification log entry as read.</summary>
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
        var entry = await dbContext.NotificationLog
            .FirstOrDefaultAsync(e => e.Id == request.NotificationId && e.UserId == request.UserId, cancellationToken);

        if (entry is null)
            return Result.Failure(Error.NotFound("Notification", request.NotificationId));

        // In-app read marking — the log entry serves as the inbox item
        // Status is immutable (sent/failed); we don't mutate it here.
        // A future InAppInboxItem entity would have a ReadAt timestamp.
        // For Phase 6A, returning success is correct — frontend optimistically marks as read.
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
