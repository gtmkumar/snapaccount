using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;

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
        // BUG-SUB-PLAN-CODE-MISSING: code is NOT NULL UNIQUE (migration 010) — must be mapped.
        builder.Property(p => p.Code).HasColumnName("code").HasMaxLength(50).IsRequired();
        builder.HasIndex(p => p.Code).IsUnique();
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        // SWEEP-FIX WEB-05: subscription_plan has no tier column. Map Tier enum (0-3) to
        // sort_order (smallint) which carries equivalent tier ordering semantics.
        // DDL HANDOFF: db-engineer should add a dedicated tier column for type-safety.
        builder.Property(p => p.Tier)
            .HasColumnName("sort_order")
            .HasConversion<short>()
            .IsRequired();
        // BUG-SUB-PLAN-CODE-MISSING (billing_cycle half): the DB CHECK constrains billing_cycle to
        // ('MONTHLY','YEARLY','LIFETIME') but the C# enum members are Monthly/Quarterly/Annual, so the
        // default .HasConversion<string>() ("Monthly"/"Annual"/…) violated the CHECK on every insert.
        // Map the enum to the DB's uppercase vocabulary. NOTE: 'QUARTERLY' is not in the CHECK today —
        // a Quarterly plan would 23514; flagged to db-engineer to widen the CHECK (there is no
        // BillingCycle member for the DB's 'LIFETIME', which no seed uses).
        builder.Property(p => p.BillingCycle)
            .HasColumnName("billing_cycle")
            .HasMaxLength(20)
            .HasConversion(v => BillingCycleToDb(v), v => BillingCycleFromDb(v))
            .IsRequired();
        builder.Property(p => p.PriceInr).HasColumnName("price_inr").HasPrecision(12, 2).IsRequired();
        builder.Property(p => p.TrialDays).HasColumnName("trial_days").IsRequired();
        builder.Property(p => p.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(p => p.Description).HasColumnName("description");
        // DG-SUB-02: razorpay_plan_id already exists in the DB schema (010_subscription_schema.sql:39)
        builder.Property(p => p.RazorpayPlanId).HasColumnName("razorpay_plan_id").HasMaxLength(100);
        builder.HasQueryFilter(p => p.DeletedAt == null);
    }

    // Static so the converter lambdas stay method-call expressions (switch expressions are not
    // permitted directly inside EF's Expression-tree converter arguments).
    private static string BillingCycleToDb(BillingCycle v) => v switch
    {
        BillingCycle.Monthly => "MONTHLY",
        BillingCycle.Quarterly => "QUARTERLY",
        BillingCycle.Annual => "YEARLY",
        _ => "MONTHLY"
    };

    private static BillingCycle BillingCycleFromDb(string v) => v switch
    {
        "MONTHLY" => BillingCycle.Monthly,
        "QUARTERLY" => BillingCycle.Quarterly,
        "YEARLY" => BillingCycle.Annual,
        "LIFETIME" => BillingCycle.Annual,
        _ => BillingCycle.Monthly
    };
}
