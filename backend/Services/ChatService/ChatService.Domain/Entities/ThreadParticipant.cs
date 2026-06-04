using ChatService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A user participating in a <see cref="ChatThread"/>.
/// Canonical table: chat.thread_participants (migration 029).
/// Soft-deleted on DPDP user erasure — never hard-deleted (DB triggers block it).
///
/// Derives from <see cref="BaseEntity"/> (NOT <see cref="BaseAuditableEntity"/>):
/// the canonical table has a composite PK (thread_id, user_id) and NO surrogate id /
/// created_at / updated_at / created_by / updated_by columns, so the audit-column
/// auto-mapping in BaseDbContext must not apply here. Only <see cref="DeletedAt"/>
/// exists (deleted_at) and is declared explicitly.
/// </summary>
public class ThreadParticipant : BaseEntity
{
    /// <summary>Parent thread.</summary>
    public Guid ThreadId { get; private set; }

    /// <summary>The user participating in the thread.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Role within this thread context.</summary>
    public ParticipantRole Role { get; private set; }

    /// <summary>Soft-delete timestamp (deleted_at). Non-null = logically removed.</summary>
    public DateTime? DeletedAt { get; private set; }

    /// <summary>Navigation back to the parent thread (for IDOR checks).</summary>
    public ChatThread Thread { get; private set; } = null!;

    private ThreadParticipant() { }

    /// <summary>Creates a participant record for a thread.</summary>
    public static ThreadParticipant Create(Guid threadId, Guid userId, ParticipantRole role)
        => new()
        {
            ThreadId = threadId,
            UserId = userId,
            Role = role
        };

    /// <summary>DPDP: soft-delete participant on user erasure.</summary>
    public void SoftDelete() => DeletedAt = DateTime.UtcNow;
}
