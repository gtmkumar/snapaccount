using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="AiInteraction"/> — maps to <c>ai.interactions</c>.
/// Audit table: never soft-deleted, append-only.
/// </summary>
public sealed class AiInteractionConfiguration : IEntityTypeConfiguration<AiInteraction>
{
    public void Configure(EntityTypeBuilder<AiInteraction> builder)
    {
        builder.ToTable("interactions", "ai");

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasColumnName("id");
        builder.Property(i => i.OrganizationId).HasColumnName("organization_id");
        builder.Property(i => i.UserId).HasColumnName("user_id").HasMaxLength(128).IsRequired();
        builder.Property(i => i.FeatureCode).HasColumnName("feature_code").HasMaxLength(64).IsRequired();
        builder.Property(i => i.Provider).HasColumnName("provider").HasMaxLength(32).IsRequired();
        builder.Property(i => i.Model).HasColumnName("model").HasMaxLength(64).IsRequired();
        builder.Property(i => i.InputTokens).HasColumnName("input_tokens").IsRequired();
        builder.Property(i => i.OutputTokens).HasColumnName("output_tokens").IsRequired();
        builder.Property(i => i.LatencyMs).HasColumnName("latency_ms").IsRequired();
        builder.Property(i => i.BudgetExceeded).HasColumnName("budget_exceeded").IsRequired();
        builder.Property(i => i.CreatedAt).HasColumnName("created_at");
        builder.Property(i => i.UpdatedAt).HasColumnName("updated_at");
        builder.Property(i => i.DeletedAt).HasColumnName("deleted_at");
        builder.Property(i => i.CreatedBy).HasColumnName("created_by");
        builder.Property(i => i.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(i => i.OrganizationId).HasDatabaseName("ix_ai_interactions_org_id");
        builder.HasIndex(i => i.CreatedAt).HasDatabaseName("ix_ai_interactions_created_at");
        builder.HasIndex(i => new { i.OrganizationId, i.FeatureCode, i.CreatedAt })
            .HasDatabaseName("ix_ai_interactions_org_feature_date");
    }
}
