namespace AuthService.Domain.Entities;

/// <summary>
/// Read-only projection of <c>shared.audit_log</c> rows. The shared table is
/// written by every microservice; AuthService exposes a thin admin-only
/// query handler against it for the cross-service audit feed widget.
///
/// Schema lives in <c>shared</c> (not <c>auth</c>) and is partitioned by
/// month — see migration 012. EF migrations on this entity must NEVER run;
/// the table is owned by the schema migration.
/// </summary>
public class AuditLogEntry
{
    public Guid Id { get; init; }
    public DateTime EventTime { get; init; }
    public string Service { get; init; } = string.Empty;
    public string EntityType { get; init; } = string.Empty;
    public Guid EntityId { get; init; }
    public string Action { get; init; } = string.Empty;
    public Guid? ActorUserId { get; init; }
    public string ActorType { get; init; } = "USER";
    public Guid? OrganizationId { get; init; }
    public bool IsSensitive { get; init; }
    public DateTime CreatedAt { get; init; }
}
