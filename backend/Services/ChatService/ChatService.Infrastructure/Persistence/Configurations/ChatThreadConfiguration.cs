using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for chat.threads table.</summary>
public class ChatThreadConfiguration : IEntityTypeConfiguration<ChatThread>
{
    public void Configure(EntityTypeBuilder<ChatThread> builder)
    {
        builder.ToTable("threads");

        builder.HasKey(t => t.Id);

        builder.Property(t => t.OrganizationId)
            .HasColumnName("org_id")
            .IsRequired();

        builder.Property(t => t.InitiatedByUserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(t => t.Category)
            .HasColumnName("category")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(t => t.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(t => t.Subject)
            .HasColumnName("subject")
            .HasMaxLength(500);

        builder.Property(t => t.AssignedToUserId)
            .HasColumnName("assigned_ca_id");

        builder.Property(t => t.ResolvedAt)
            .HasColumnName("resolved_at");

        builder.Property(t => t.ResolvedByUserId)
            .HasColumnName("resolved_by");

        // escalated_at is NOT part of the original canonical schema (migration 029).
        // Added non-destructively in migration 054_chat_threads_escalated_at.sql so the
        // domain's Escalate() flow can persist the timestamp without renaming columns.
        builder.Property(t => t.EscalatedAt)
            .HasColumnName("escalated_at");

        builder.HasMany(t => t.Messages)
            .WithOne()
            .HasForeignKey(m => m.ThreadId)
            .OnDelete(DeleteBehavior.Restrict);

        // The ChatThread.Participants <-> ThreadParticipant.Thread relationship is
        // configured in ThreadParticipantConfiguration (both ends, single FK on ThreadId).

        builder.HasIndex(t => t.OrganizationId).HasDatabaseName("ix_threads_org_id");
        builder.HasIndex(t => new { t.OrganizationId, t.Status }).HasDatabaseName("ix_threads_org_status");
        builder.HasIndex(t => t.InitiatedByUserId).HasDatabaseName("ix_threads_user_id");
        builder.HasIndex(t => t.UpdatedAt).HasDatabaseName("ix_threads_updated_at");

        // Global query filter: exclude soft-deleted
        builder.HasQueryFilter(t => t.DeletedAt == null);
    }
}
