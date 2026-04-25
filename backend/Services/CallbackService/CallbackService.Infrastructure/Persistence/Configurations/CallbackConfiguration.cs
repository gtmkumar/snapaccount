using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for the <see cref="Callback"/> entity.</summary>
public sealed class CallbackConfiguration : IEntityTypeConfiguration<Callback>
{
    public void Configure(EntityTypeBuilder<Callback> builder)
    {
        builder.ToTable("callbacks");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");

        // user_id is nullable: set to NULL by DPDP Right-to-Erasure (SEC-027)
        builder.Property(c => c.UserId).HasColumnName("user_id");
        builder.Property(c => c.OrganizationId).HasColumnName("organization_id");
        builder.Property(c => c.Status).HasColumnName("status").IsRequired();
        builder.Property(c => c.Category).HasColumnName("category").IsRequired();
        builder.Property(c => c.Priority).HasColumnName("priority").IsRequired();
        builder.Property(c => c.AssignedAgentId).HasColumnName("assigned_agent_id");
        builder.Property(c => c.PreferredWindowStart).HasColumnName("preferred_window_start");
        builder.Property(c => c.PreferredWindowEnd).HasColumnName("preferred_window_end");
        builder.Property(c => c.ScheduledAt).HasColumnName("scheduled_at");
        builder.Property(c => c.CompletedAt).HasColumnName("completed_at");
        builder.Property(c => c.IssueDescription).HasColumnName("issue_description").HasMaxLength(1000);
        builder.Property(c => c.ResolutionSummary).HasColumnName("resolution_summary").HasMaxLength(2000);
        builder.Property(c => c.PhoneNumber).HasColumnName("phone_number").HasMaxLength(15).IsRequired();
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
