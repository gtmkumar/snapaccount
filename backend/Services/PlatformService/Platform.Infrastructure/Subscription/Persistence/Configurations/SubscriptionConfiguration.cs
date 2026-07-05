using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;

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
        // BUG-SUB-SUBSCRIBE-WRITE: user_id is NOT NULL (migration 010) — map + persist it.
        builder.Property(s => s.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(s => s.PlanId).HasColumnName("plan_id").IsRequired();
        // BUG-SUB-SUBSCRIBE-WRITE: the DB CHECK constrains status to TRIAL/ACTIVE/PAST_DUE/
        // CANCELLED/EXPIRED/PAUSED/PENDING, but the C# enum members are Trialing/Active/PastDue/
        // Cancelled/Paused — .HasConversion<string>() ("Trialing"/"PastDue"/…) violated the CHECK.
        // Map to the DB vocabulary.
        builder.Property(s => s.Status)
            .HasColumnName("status")
            .HasMaxLength(30)
            .HasConversion(v => StatusToDb(v), v => StatusFromDb(v))
            .IsRequired();
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

    // Static so the converter lambdas remain method-call expressions (switch expressions are not
    // allowed directly inside EF's Expression-tree converter arguments).
    private static string StatusToDb(SubscriptionStatus v) => v switch
    {
        SubscriptionStatus.Trialing => "TRIAL",
        SubscriptionStatus.Active => "ACTIVE",
        SubscriptionStatus.PastDue => "PAST_DUE",
        SubscriptionStatus.Cancelled => "CANCELLED",
        SubscriptionStatus.Paused => "PAUSED",
        _ => "PENDING"
    };

    private static SubscriptionStatus StatusFromDb(string v) => v switch
    {
        "TRIAL" => SubscriptionStatus.Trialing,
        "ACTIVE" => SubscriptionStatus.Active,
        "PAST_DUE" => SubscriptionStatus.PastDue,
        "CANCELLED" => SubscriptionStatus.Cancelled,
        "PAUSED" => SubscriptionStatus.Paused,
        "EXPIRED" => SubscriptionStatus.Cancelled,
        _ => SubscriptionStatus.Trialing
    };
}
