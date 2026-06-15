using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="EditLog"/>, mapping to <c>accounting.edit_log</c>.
/// This table is APPEND-ONLY (no updated_at, no deleted_at). The application reads
/// it for auditor export; writes happen via DB-level triggers only.
/// </summary>
public sealed class EditLogConfiguration : IEntityTypeConfiguration<EditLog>
{
    public void Configure(EntityTypeBuilder<EditLog> builder)
    {
        builder.ToTable("edit_log");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.OrgId).HasColumnName("org_id");
        builder.Property(e => e.EntityType).HasColumnName("entity_type").HasMaxLength(50).IsRequired();
        builder.Property(e => e.EntityId).HasColumnName("entity_id").IsRequired();
        builder.Property(e => e.Operation).HasColumnName("operation").HasMaxLength(10).IsRequired();
        builder.Property(e => e.ChangedBy).HasColumnName("changed_by");
        builder.Property(e => e.ChangedAt).HasColumnName("changed_at").IsRequired();
        builder.Property(e => e.BeforeState).HasColumnName("before_state").HasColumnType("jsonb");
        builder.Property(e => e.AfterState).HasColumnName("after_state").HasColumnType("jsonb");
        builder.Property(e => e.ChangeReason).HasColumnName("change_reason");
        builder.Property(e => e.RequestId).HasColumnName("request_id").HasMaxLength(128);
        builder.Property(e => e.CorrelationId).HasColumnName("correlation_id").HasMaxLength(128);
        builder.Property(e => e.FyYear).HasColumnName("fy_year").HasMaxLength(10);
        builder.Property(e => e.RetentionUntil).HasColumnName("retention_until");
        // created_at: DB default NOW(); mapped for read-only access
        builder.Property(e => e.CreatedAt).HasColumnName("created_at");

        // DB indexes (created by migration 071 — declare here for EF model awareness)
        builder.HasIndex(e => new { e.OrgId, e.ChangedAt }).HasDatabaseName("idx_edit_log_org_changed_at");
        builder.HasIndex(e => new { e.EntityType, e.EntityId }).HasDatabaseName("idx_edit_log_entity");
        builder.HasIndex(e => new { e.OrgId, e.FyYear }).HasDatabaseName("idx_edit_log_org_fy");
    }
}
