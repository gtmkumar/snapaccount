using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="Callback"/> entity.
///
/// Column names are reconciled to the canonical SQL schema created by
/// <c>database/migrations/018_callback_schema.sql</c> (there are no EF migrations
/// for this service; the SQL is canonical). Where the entity carries a scalar
/// property but the canonical table only has an incompatible <c>tstzrange</c>
/// column (preferred window, scheduled-at), the scalar properties are mapped to
/// additive <c>timestamptz</c> columns added by migration
/// <c>054_callback_ef_alignment.sql</c>; the legacy range columns are left intact.
/// </summary>
public sealed class CallbackConfiguration : IEntityTypeConfiguration<Callback>
{
    public void Configure(EntityTypeBuilder<Callback> builder)
    {
        builder.ToTable("callbacks");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");

        // user_id is nullable: set to NULL by DPDP Right-to-Erasure (SEC-027)
        builder.Property(c => c.UserId).HasColumnName("user_id");

        // org_id is the canonical column (was incorrectly mapped to organization_id).
        builder.Property(c => c.OrganizationId).HasColumnName("org_id");

        // status/category/priority are VARCHAR + CHECK constraints in SQL — store as
        // strings (the column type is character varying, not integer). Without the
        // string conversion EF emits integer comparisons against a varchar column,
        // which is exactly what made the dashboard count queries 500.
        builder.Property(c => c.Status).HasColumnName("status").HasConversion<string>().IsRequired();
        builder.Property(c => c.Category).HasColumnName("category").HasConversion<string>().IsRequired();
        builder.Property(c => c.Priority).HasColumnName("priority").HasConversion<string>().IsRequired();

        // assigned_to is the canonical column (was incorrectly mapped to assigned_agent_id).
        builder.Property(c => c.AssignedAgentId).HasColumnName("assigned_to");

        // The canonical table stores the suggested window as a single tstzrange
        // (preferred_window). The entity models it as two scalar timestamps, so we
        // map to the additive scalar columns added in migration 054 and leave the
        // legacy preferred_window range column untouched.
        builder.Property(c => c.PreferredWindowStart).HasColumnName("preferred_window_start");
        builder.Property(c => c.PreferredWindowEnd).HasColumnName("preferred_window_end");

        // scheduled_at in SQL is a tstzrange; the entity uses a scalar DateTime.
        // Map the scalar to the additive scheduled_at_ts column (migration 054);
        // the legacy scheduled_at range column is left untouched.
        builder.Property(c => c.ScheduledAt).HasColumnName("scheduled_at_ts");

        builder.Property(c => c.CompletedAt).HasColumnName("completed_at");

        // reason_text is the canonical free-text column (was mapped to a
        // non-existent issue_description column).
        builder.Property(c => c.IssueDescription).HasColumnName("reason_text").HasMaxLength(1000);

        // resolution_summary, phone_number, escalation_reason and reschedule_count
        // have no column in the canonical table; they are added (nullable) by
        // migration 054. phone_number is added nullable even though the entity marks
        // it required, because the existing table may already contain rows and a
        // NOT NULL column without a default cannot be added safely.
        builder.Property(c => c.ResolutionSummary).HasColumnName("resolution_summary").HasMaxLength(2000);
        builder.Property(c => c.PhoneNumber).HasColumnName("phone_number").HasMaxLength(15);
        builder.Property(c => c.EscalationReason).HasColumnName("escalation_reason").HasMaxLength(500);
        builder.Property(c => c.CancellationReason).HasColumnName("cancellation_reason").HasMaxLength(500);
        builder.Property(c => c.RescheduleCount).HasColumnName("reschedule_count").IsRequired();

        // SEC-027: DPDP anonymization columns (already in migration 018)
        builder.Property(c => c.AnonymizedAt).HasColumnName("anonymized_at");
        builder.Property(c => c.AnonymizationReason).HasColumnName("anonymization_reason").HasMaxLength(100);

        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        builder.Property(c => c.CreatedBy).HasColumnName("created_by");
        builder.Property(c => c.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(c => c.UserId).HasDatabaseName("ix_callbacks_user_id");
        builder.HasIndex(c => c.Status).HasDatabaseName("ix_callbacks_status");
        builder.HasIndex(c => new { c.OrganizationId, c.Status })
            .HasDatabaseName("ix_callbacks_org_status");
        builder.HasIndex(c => c.AssignedAgentId).HasDatabaseName("ix_callbacks_agent_id");

        builder.HasMany(c => c.Notes)
            .WithOne()
            .HasForeignKey(n => n.CallbackId)
            .OnDelete(DeleteBehavior.Cascade);

        // Global query filter: soft delete
        builder.HasQueryFilter(c => c.DeletedAt == null);
    }
}
