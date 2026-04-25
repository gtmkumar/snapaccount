using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// Records that a user has read a message.
/// Canonical table: chat.read_receipts (migration 029).
/// </summary>
public class ReadReceipt : BaseAuditableEntity
{
    /// <summary>Thread this receipt belongs to (for efficient inbox queries).</summary>
    public Guid ThreadId { get; private set; }

    /// <summary>Message that was read.</summary>
    public Guid MessageId { get; private set; }

    /// <summary>User who read the message.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Timestamp when the user read the message.</summary>
    public DateTime ReadAt { get; private set; }

    private ReadReceipt() { }

    /// <summary>Creates a read receipt.</summary>
    public static ReadReceipt Create(Guid threadId, Guid messageId, Guid userId)
        => new()
        {
            ThreadId = threadId,
            MessageId = messageId,
            UserId = userId,
            ReadAt = DateTime.UtcNow
        };
}
