using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.MarkRead;

/// <summary>Marks all messages in a thread as read up to (and including) a given message ID.</summary>
public record MarkReadCommand(Guid ThreadId, Guid? UpToMessageId = null) : ICommand<Result>;

/// <summary>Validates MarkReadCommand.</summary>
public sealed class MarkReadCommandValidator : AbstractValidator<MarkReadCommand>
{
    public MarkReadCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
    }
}

/// <summary>Handler: inserts read receipts for unread messages in the thread.</summary>
public sealed class MarkReadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<MarkReadCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        MarkReadCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        // IDOR: verify thread belongs to org
        var threadExists = await db.Threads
            .AnyAsync(t => t.Id == request.ThreadId
                          && t.OrganizationId == orgId
                          && t.DeletedAt == null, cancellationToken);

        if (!threadExists)
            return Error.NotFound("ChatThread", request.ThreadId);

        // Find messages not yet read by this user
        var alreadyReadIds = await db.ReadReceipts
            .Where(r => r.ThreadId == request.ThreadId && r.UserId == currentUser.UserId)
            .Select(r => r.MessageId)
            .ToListAsync(cancellationToken);

        var query = db.Messages
            .Where(m => m.ThreadId == request.ThreadId
                        && m.SenderUserId != currentUser.UserId
                        && m.DeletedAt == null
                        && !alreadyReadIds.Contains(m.Id));

        if (request.UpToMessageId.HasValue)
        {
            var upTo = await db.Messages
                .Where(m => m.Id == request.UpToMessageId && m.DeletedAt == null)
                .Select(m => m.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            query = query.Where(m => m.CreatedAt <= upTo);
        }

        var unreadMessages = await query.Select(m => m.Id).ToListAsync(cancellationToken);

        foreach (var msgId in unreadMessages)
            db.ReadReceipts.Add(ReadReceipt.Create(request.ThreadId, msgId, currentUser.UserId));

        if (unreadMessages.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
