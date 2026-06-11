using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Bookmarks.Commands.ToggleBookmark;

/// <summary>
/// Toggles a bookmark on a chat message for the current user.
/// If the bookmark does not exist it is created; if it exists it is soft-deleted.
/// Returns the new bookmark state.
/// RBAC: requires chat.read (same as reading messages).
/// </summary>
[RequiresPermission("chat.read")]
public record ToggleBookmarkCommand(
    Guid MessageId,
    string? Note = null) : ICommand<ToggleBookmarkResponse>;

/// <summary>Response showing the new bookmark state.</summary>
public record ToggleBookmarkResponse(
    Guid MessageId,
    bool IsBookmarked,
    Guid? BookmarkId);

/// <summary>Validates ToggleBookmarkCommand.</summary>
public sealed class ToggleBookmarkCommandValidator : AbstractValidator<ToggleBookmarkCommand>
{
    public ToggleBookmarkCommandValidator()
    {
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500).When(x => x.Note != null);
    }
}

/// <summary>Handles ToggleBookmarkCommand — create or soft-delete bookmark.</summary>
public sealed class ToggleBookmarkCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<ToggleBookmarkCommand, ToggleBookmarkResponse>
{
    /// <inheritdoc />
    public async Task<Result<ToggleBookmarkResponse>> Handle(
        ToggleBookmarkCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<ToggleBookmarkResponse>.Failure(Error.Unauthorized("Bookmark.Unauthenticated", "User is not authenticated."));

        // Verify the message exists (global query filter excludes deleted messages)
        var messageExists = await db.Messages
            .AnyAsync(m => m.Id == request.MessageId, cancellationToken);

        if (!messageExists)
            return Result<ToggleBookmarkResponse>.Failure(Error.NotFound("Message.NotFound", "Message not found."));

        // Check for existing active bookmark (global query filter excludes soft-deleted)
        var existing = await db.MessageBookmarks
            .FirstOrDefaultAsync(b => b.UserId == currentUser.UserId
                                   && b.MessageId == request.MessageId,
                cancellationToken);

        if (existing != null)
        {
            // Toggle off — soft delete
            existing.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return Result<ToggleBookmarkResponse>.Success(
                new ToggleBookmarkResponse(request.MessageId, false, null));
        }

        // Toggle on — create
        var bookmark = MessageBookmark.Create(currentUser.UserId, request.MessageId, request.Note);
        db.MessageBookmarks.Add(bookmark);
        await db.SaveChangesAsync(cancellationToken);

        return Result<ToggleBookmarkResponse>.Success(
            new ToggleBookmarkResponse(request.MessageId, true, bookmark.Id));
    }
}
