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
        // Migration 066 applied: subscription.usage_record table name confirmed (singular).
        // Columns feature_code, units, correlation_id now exist — full entity mapping restored.
        builder.ToTable("usage_record");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");

        // OrgId → organization_id (convention would generate org_id which doesn't exist in DB)
        builder.Property(r => r.OrgId).HasColumnName("organization_id");

        // PeriodStart/PeriodEnd → billing_period_start/billing_period_end (DB uses date type)
        builder.Property(r => r.PeriodStart).HasColumnName("billing_period_start");
        builder.Property(r => r.PeriodEnd).HasColumnName("billing_period_end");

        // Migration 066: feature_code, units, correlation_id columns added to subscription.usage_record.
        // Re-enable direct mappings (removed Ignore() calls).
        builder.Property(r => r.FeatureCode).HasColumnName("feature_code").HasMaxLength(100);
        builder.Property(r => r.Units).HasColumnName("units");
        builder.Property(r => r.CorrelationId).HasColumnName("correlation_id").HasMaxLength(200);

        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        // DB also has subscription_id UUID — shadow property
        builder.Property<Guid?>("SubscriptionId").HasColumnName("subscription_id");

        builder.HasIndex(r => r.OrgId).HasDatabaseName("ix_usage_record_org_id");

        builder.Ignore(r => r.DomainEvents);
    }
}
