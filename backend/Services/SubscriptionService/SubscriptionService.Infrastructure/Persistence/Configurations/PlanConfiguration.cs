using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for subscription.plans table.</summary>
public class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> builder)
    {
        builder.ToTable("plans");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
        builder.Property(p => p.Tier).HasColumnName("tier").HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(p => p.BillingCycle).HasColumnName("billing_cycle").HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(p => p.PriceInr).HasColumnName("price_inr").HasPrecision(12, 2).IsRequired();
        builder.Property(p => p.TrialDays).HasColumnName("trial_days").IsRequired();
        builder.Property(p => p.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(p => p.Description).HasColumnName("description").HasMaxLength(2000);
        builder.HasIndex(p => p.Tier).HasDatabaseName("ix_plans_tier");
        builder.HasQueryFilter(p => p.DeletedAt == null);
    }
}
