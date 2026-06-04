using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// Records the last message a user has read in a thread.
/// Canonical table: chat.read_receipts (migration 029) — a per-(thread,user)
/// "last-read pointer": composite PK (thread_id, user_id), columns
/// last_read_message_id / last_read_at / updated_at.
///
/// Derives from <see cref="BaseEntity"/> (NOT <see cref="BaseAuditableEntity"/>):
/// the canonical table has NO surrogate id / created_at / created_by / updated_by /
/// deleted_at columns, so the audit-column auto-mapping and soft-delete query filter
/// in BaseDbContext must not apply here.
/// </summary>
public class ReadReceipt : BaseEntity
{
    /// <summary>Thread this receipt belongs to (for efficient inbox queries).</summary>
    public Guid ThreadId { get; private set; }

    /// <summary>Last message read by the user (last_read_message_id).</summary>
    public Guid MessageId { get; private set; }

    /// <summary>User who read the message.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Timestamp when the user last read (last_read_at).</summary>
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
