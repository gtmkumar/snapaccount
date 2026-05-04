using SnapAccount.Shared.Domain;

namespace CallbackService.Domain.Entities;

/// <summary>
/// SEC-030: Audit row for every callback assignment / reassignment.
/// Persisted to <c>callback.assignments_log</c> by the application layer
/// (table created in migration 018; row writes were previously missing).
/// </summary>
public class AssignmentLog : BaseAuditableEntity
{
    public Guid CallbackId { get; private set; }
    public Guid? FromUserId { get; private set; }
    public Guid ToUserId { get; private set; }
    public Guid AssignedBy { get; private set; }
    public string? Reason { get; private set; }
    public DateTime AssignedAt { get; private set; }

    private AssignmentLog() { }

    public static AssignmentLog Create(
        Guid callbackId, Guid? fromUserId, Guid toUserId,
        Guid assignedBy, string? reason)
        => new()
        {
            CallbackId = callbackId,
            FromUserId = fromUserId,
            ToUserId = toUserId,
            AssignedBy = assignedBy,
            Reason = reason,
            AssignedAt = DateTime.UtcNow,
        };
}
