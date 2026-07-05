using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for subscription.subscription table.
/// SWEEP-FIX WEB-05: table is subscription (not subscriptions).
/// </summary>
public class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> builder)
    {
        builder.ToTable("subscription");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(s => s.PlanId).HasColumnName("plan_id").IsRequired();
        builder.Property(s => s.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(s => s.CurrentPeriodStart).HasColumnName("current_period_start").IsRequired();
        builder.Property(s => s.CurrentPeriodEnd).HasColumnName("current_period_end").IsRequired();
        builder.Property(s => s.RazorpaySubscriptionId).HasColumnName("razorpay_subscription_id").HasMaxLength(100);
        builder.Property(s => s.RazorpayCustomerId).HasColumnName("razorpay_customer_id").HasMaxLength(100);
        builder.Property(s => s.CancelledAt).HasColumnName("cancelled_at");

        builder.HasOne(s => s.Plan)
            .WithMany()
            .HasForeignKey(s => s.PlanId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(s => s.Invoices)
            .WithOne()
            .HasForeignKey(i => i.SubscriptionId)
            .OnDelete(DeleteBehavior.Restrict);

        // BUG-FIX (42703: column s.anonymization_reason does not exist):
        // subscription.subscription table does NOT have anonymization_reason or anonymized_at columns.
        // These DPDP fields exist on the domain entity but have not been added to the DB yet.
        // DDL HANDOFF (db-engineer): add the following to subscription.subscription:
        //   anonymized_at TIMESTAMPTZ, anonymization_reason VARCHAR(200)
        builder.Ignore(s => s.AnonymizedAt);
        builder.Ignore(s => s.AnonymizationReason);

        // DB columns user_id, billing_cycle, current_period_start/end, trial_start/end,
        // cancellation_reason, cancel_at_period_end, auto_renew — map via convention (snake_case).
        // BaseDbContext applies EF snake_case naming convention globally; explicit mapping not needed.

        builder.HasIndex(s => s.OrganizationId).HasDatabaseName("ix_subscriptions_org_id");
        builder.HasIndex(s => s.Status).HasDatabaseName("ix_subscriptions_status");
        builder.HasIndex(s => s.RazorpaySubscriptionId).HasDatabaseName("ix_subscriptions_razorpay_id");
        builder.HasQueryFilter(s => s.DeletedAt == null);
    }
}
