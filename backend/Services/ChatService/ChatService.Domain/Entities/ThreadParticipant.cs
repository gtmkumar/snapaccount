using ChatService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A user participating in a <see cref="ChatThread"/>.
/// Canonical table: chat.thread_participants (migration 029).
/// Soft-deleted on DPDP user erasure — never hard-deleted (DB triggers block it).
/// </summary>
public class ThreadParticipant : BaseAuditableEntity
{
    /// <summary>Parent thread.</summary>
    public Guid ThreadId { get; private set; }

    /// <summary>The user participating in the thread.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Role within this thread context.</summary>
    public ParticipantRole Role { get; private set; }

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
