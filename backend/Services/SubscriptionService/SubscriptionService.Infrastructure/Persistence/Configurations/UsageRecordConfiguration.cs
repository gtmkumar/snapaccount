using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="UsageRecord"/> → <c>subscription.usage_records</c>.
/// Append-only metering ledger. High write volume expected.
/// </summary>
public class UsageRecordConfiguration : IEntityTypeConfiguration<UsageRecord>
{
    public void Configure(EntityTypeBuilder<UsageRecord> builder)
    {
        builder.ToTable("usage_records");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.OrgId).HasColumnName("org_id");
        builder.Property(r => r.FeatureCode).HasColumnName("feature_code").HasMaxLength(100).IsRequired();
        builder.Property(r => r.Units).HasColumnName("units");
        builder.Property(r => r.PeriodStart).HasColumnName("period_start");
        builder.Property(r => r.PeriodEnd).HasColumnName("period_end");
        builder.Property(r => r.CorrelationId).HasColumnName("correlation_id").HasMaxLength(200);
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        // Composite index for monthly aggregation query
        builder.HasIndex(r => new { r.OrgId, r.FeatureCode, r.PeriodStart })
            .HasDatabaseName("ix_usage_records_org_feature_period");
        builder.HasIndex(r => r.OrgId).HasDatabaseName("ix_usage_records_org_id");

        builder.Ignore(r => r.DomainEvents);
    }
}
