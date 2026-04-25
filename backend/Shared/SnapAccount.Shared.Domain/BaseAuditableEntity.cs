namespace SnapAccount.Shared.Domain;

/// <summary>
/// Extends <see cref="BaseEntity"/> with audit columns and soft-delete support.
/// All SnapAccount domain entities that are user-owned and require audit tracking
/// should inherit from this class.
///
/// Audit fields (<c>CreatedAt</c>, <c>UpdatedAt</c>, <c>CreatedBy</c>, <c>UpdatedBy</c>)
/// are populated automatically by
/// <see cref="SnapAccount.Shared.Infrastructure.Persistence.Interceptors.AuditableEntityInterceptor"/>
/// on every SaveChanges call.
/// </summary>
public abstract class BaseAuditableEntity : BaseEntity
{
    /// <summary>Set by <see cref="SnapAccount.Shared.Infrastructure.Persistence.Interceptors.AuditableEntityInterceptor"/> on SaveChanges.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Set by <see cref="SnapAccount.Shared.Infrastructure.Persistence.Interceptors.AuditableEntityInterceptor"/> on SaveChanges.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>Soft-delete timestamp. Non-null means the record is logically deleted.</summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>Firebase UID / user ID of the creator — populated by AuditableEntityInterceptor.</summary>
    public string? CreatedBy { get; set; }

    /// <summary>Firebase UID / user ID of the last modifier — populated by AuditableEntityInterceptor.</summary>
    public string? UpdatedBy { get; set; }
}
