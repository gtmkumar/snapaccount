using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF config for the read-only projection of <c>shared.audit_log</c>.
/// Keyless to discourage write-side use; the actual table has a composite
/// PK (id, created_at) due to monthly partitioning.
/// </summary>
public sealed class AuditLogEntryConfiguration : IEntityTypeConfiguration<AuditLogEntry>
{
    public void Configure(EntityTypeBuilder<AuditLogEntry> builder)
    {
        builder.ToTable("audit_log", schema: "shared");
        builder.HasKey(e => e.Id);                 // matches non-composite reads
        builder.Property(e => e.EventTime).HasColumnName("event_time");
        builder.Property(e => e.Service).HasColumnName("service").HasMaxLength(100);
        builder.Property(e => e.EntityType).HasColumnName("entity_type").HasMaxLength(100);
        builder.Property(e => e.EntityId).HasColumnName("entity_id");
        builder.Property(e => e.Action).HasColumnName("action").HasMaxLength(50);
        builder.Property(e => e.ActorUserId).HasColumnName("actor_user_id");
        builder.Property(e => e.ActorType).HasColumnName("actor_type").HasMaxLength(30);
        builder.Property(e => e.OrganizationId).HasColumnName("organization_id");
        builder.Property(e => e.IsSensitive).HasColumnName("is_sensitive");
        builder.Property(e => e.CreatedAt).HasColumnName("created_at");
    }
}
