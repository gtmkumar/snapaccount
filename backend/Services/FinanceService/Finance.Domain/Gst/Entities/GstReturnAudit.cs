using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Append-only audit record for every GST return state transition and ARN edit.
/// Satisfies DG-GST-02: admin AuditTrailPanel + ARN capture.
///
/// Never deleted — 7-year document retention applies.
/// Uses <see cref="BaseEntity"/> (not BaseAuditableEntity) because rows are immutable:
/// there are no UpdatedAt / DeletedAt concerns.
/// </summary>
public sealed class GstReturnAudit : BaseEntity
{
    /// <summary>The GST return this audit row belongs to.</summary>
    public Guid GstReturnId { get; private init; }

    /// <summary>
    /// Event type — one of:
    ///   CREATED, SUBMITTED, APPROVED, FILED, REVISION_REQUESTED, ARN_UPDATED, ASSIGNED.
    /// </summary>
    public string EventType { get; private init; } = string.Empty;

    /// <summary>Actor who triggered the event (auth.user.id).</summary>
    public Guid ActorUserId { get; private init; }

    /// <summary>Actor email snapshot — denormalised for display without a cross-schema join.</summary>
    public string ActorEmail { get; private init; } = string.Empty;

    /// <summary>Optional actor display name snapshot.</summary>
    public string? ActorDisplayName { get; private init; }

    /// <summary>GST return status before the transition (null for CREATED / ARN_UPDATED).</summary>
    public string? PreviousStatus { get; private init; }

    /// <summary>Human-readable detail or reason (rejection note, revision note, etc.).</summary>
    public string? Detail { get; private init; }

    /// <summary>
    /// ARN at the time of this event — populated for FILED and ARN_UPDATED events.
    /// Matches the <c>arnReceived</c> field in <c>AuditEventSchema</c>.
    /// </summary>
    public string? ArnReceived { get; private init; }

    /// <summary>UTC timestamp of the event (set at creation, never mutated).</summary>
    public DateTime Timestamp { get; private init; }

    // Private constructor for EF Core materialisation.
    private GstReturnAudit() { }

    /// <summary>Records a state-transition event on a GST return.</summary>
    public static GstReturnAudit RecordTransition(
        Guid gstReturnId,
        string eventType,
        Guid actorUserId,
        string actorEmail,
        string? previousStatus,
        string? detail = null,
        string? arn = null,
        string? actorDisplayName = null)
        => new()
        {
            Id = Guid.NewGuid(),
            GstReturnId = gstReturnId,
            EventType = eventType,
            ActorUserId = actorUserId,
            ActorEmail = actorEmail,
            ActorDisplayName = actorDisplayName,
            PreviousStatus = previousStatus,
            Detail = detail,
            ArnReceived = arn,
            Timestamp = DateTime.UtcNow,
        };

    /// <summary>Records an ARN-update event (status stays FILED, only ARN changes).</summary>
    public static GstReturnAudit RecordArnUpdate(
        Guid gstReturnId,
        Guid actorUserId,
        string actorEmail,
        string newArn)
        => new()
        {
            Id = Guid.NewGuid(),
            GstReturnId = gstReturnId,
            EventType = "ARN_UPDATED",
            ActorUserId = actorUserId,
            ActorEmail = actorEmail,
            ActorDisplayName = null,
            PreviousStatus = null,
            Detail = $"ARN updated to {newArn}",
            ArnReceived = newArn,
            Timestamp = DateTime.UtcNow,
        };
}
