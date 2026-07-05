using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AiUsageLogConfiguration : IEntityTypeConfiguration<AiUsageLog>
{
    public void Configure(EntityTypeBuilder<AiUsageLog> builder)
    {
        builder.ToTable("ai_usage_log");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).HasColumnName("id");
        builder.Property(u => u.OrganizationId).HasColumnName("organization_id");
        builder.Property(u => u.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(u => u.Model).HasColumnName("model").HasMaxLength(100);
        builder.Property(u => u.Feature).HasColumnName("feature").HasMaxLength(50);
        builder.Property(u => u.InputTokens).HasColumnName("input_tokens");
        builder.Property(u => u.OutputTokens).HasColumnName("output_tokens");
        builder.Property(u => u.Units).HasColumnName("units");
        builder.Property(u => u.LatencyMs).HasColumnName("latency_ms");
        builder.Property(u => u.CostUsd).HasColumnName("cost_usd").HasColumnType("numeric(14,6)");
        builder.Property(u => u.CreatedAt).HasColumnName("created_at");
        builder.Property(u => u.UpdatedAt).HasColumnName("updated_at");
        builder.Property(u => u.DeletedAt).HasColumnName("deleted_at");
        builder.HasIndex(u => u.CreatedAt);
        builder.Ignore(u => u.DomainEvents);
    }
}
