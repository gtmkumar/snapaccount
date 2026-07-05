using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A user-scoped bookmark on a <see cref="ChatMessage"/>.
/// Canonical table: chat.message_bookmarks (migration 080).
/// (user_id, message_id) is UNIQUE — bookmark is a toggle.
/// </summary>
public sealed class MessageBookmark : BaseAuditableEntity
{
    /// <summary>User who bookmarked this message.</summary>
    public Guid UserId { get; private set; }

    /// <summary>The bookmarked message (FK → chat.messages.id).</summary>
    public Guid MessageId { get; private set; }

    /// <summary>Optional personal note attached to the bookmark.</summary>
    public string? Note { get; private set; }

    private MessageBookmark() { }

    /// <summary>Creates a new bookmark for (userId, messageId).</summary>
    public static MessageBookmark Create(Guid userId, Guid messageId, string? note = null)
        => new()
        {
            UserId = userId,
            MessageId = messageId,
            Note = note
        };
}
