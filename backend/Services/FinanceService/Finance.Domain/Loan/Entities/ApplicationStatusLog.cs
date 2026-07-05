using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Append-only audit log of every status transition on a loan application.
///
/// P6-HANDOFF-28: every state machine transition on LoanApplication MUST insert a row here
/// in the same Unit of Work (transaction).
///
/// DB BEFORE DELETE trigger BLOCKS hard-deletes on this table (compliance).
/// Do NOT attempt to delete rows from this table — the application layer must never try.
/// </summary>
public class ApplicationStatusLog : BaseEntity
{
    /// <summary>FK to loan.applications.</summary>
    public Guid ApplicationId { get; init; }

    /// <summary>Status before the transition.</summary>
    public string FromStatus { get; init; } = string.Empty;

    /// <summary>Status after the transition.</summary>
    public string ToStatus { get; init; } = string.Empty;

    /// <summary>UTC timestamp of the transition.</summary>
    public DateTime TransitionedAt { get; init; }

    /// <summary>User ID who triggered the transition (nullable for system-triggered).</summary>
    public Guid? TransitionedBy { get; init; }

    /// <summary>Optional notes (e.g. rejection reason, bank reference, webhook message_id).</summary>
    public string? Notes { get; init; }

    /// <summary>Source of the transition (User/System/Webhook).</summary>
    public string TransitionSource { get; init; } = "User";
}
