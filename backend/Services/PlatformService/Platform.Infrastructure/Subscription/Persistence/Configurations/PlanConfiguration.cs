using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for subscription.subscription_plan table.
/// SWEEP-FIX WEB-05: table is subscription_plan, not plans.
/// </summary>
public class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> builder)
    {
        builder.ToTable("subscription_plan");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        // SWEEP-FIX WEB-05: subscription_plan has no tier column. Map Tier enum (0-3) to
        // sort_order (smallint) which carries equivalent tier ordering semantics.
        // DDL HANDOFF: db-engineer should add a dedicated tier column for type-safety.
        builder.Property(p => p.Tier)
            .HasColumnName("sort_order")
            .HasConversion<short>()
            .IsRequired();
        builder.Property(p => p.BillingCycle).HasColumnName("billing_cycle").HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(p => p.PriceInr).HasColumnName("price_inr").HasPrecision(12, 2).IsRequired();
        builder.Property(p => p.TrialDays).HasColumnName("trial_days").IsRequired();
        builder.Property(p => p.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(p => p.Description).HasColumnName("description");
        // DG-SUB-02: razorpay_plan_id already exists in the DB schema (010_subscription_schema.sql:39)
        builder.Property(p => p.RazorpayPlanId).HasColumnName("razorpay_plan_id").HasMaxLength(100);
        builder.HasQueryFilter(p => p.DeletedAt == null);
    }
}
