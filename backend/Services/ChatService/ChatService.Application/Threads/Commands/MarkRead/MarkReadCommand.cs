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

        // chat.read_receipts is a per-(thread,user) "last-read pointer" (composite PK
        // thread_id+user_id), NOT one row per message. The previous implementation added
        // one receipt per unread message, which collided on the composite PK from the
        // second message onward (and again on every later MarkRead). Instead we resolve a
        // single target — the newest message to mark read — and upsert the pointer to it.
        var targetQuery = db.Messages
            .Where(m => m.ThreadId == request.ThreadId && m.DeletedAt == null);

        if (request.UpToMessageId.HasValue)
            targetQuery = targetQuery.Where(m => m.Id == request.UpToMessageId);

        var target = await targetQuery
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new { m.Id, m.CreatedAt })
            .FirstOrDefaultAsync(cancellationToken);

        // Empty thread → nothing to read. A non-null UpToMessageId that resolves to
        // nothing means the message isn't in this thread → 404.
        if (target is null)
            return request.UpToMessageId.HasValue
                ? Error.NotFound("ChatMessage", request.UpToMessageId.Value)
                : Result.Success();

        var receipt = await db.ReadReceipts
            .FirstOrDefaultAsync(r => r.ThreadId == request.ThreadId
                                      && r.UserId == currentUser.UserId, cancellationToken);

        if (receipt is null)
        {
            db.ReadReceipts.Add(
                ReadReceipt.Create(request.ThreadId, target.Id, currentUser.UserId, target.CreatedAt));
            await db.SaveChangesAsync(cancellationToken);
        }
        else if (target.CreatedAt > receipt.ReadAt)
        {
            // Advance the pointer forward only — never regress it.
            receipt.MarkReadUpTo(target.Id, target.CreatedAt);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Result.Success();
    }
}
