using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for subscription.subscriptions table.</summary>
public class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> builder)
    {
        builder.ToTable("subscriptions");
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

        builder.HasIndex(s => s.OrganizationId).HasDatabaseName("ix_subscriptions_org_id");
        builder.HasIndex(s => s.Status).HasDatabaseName("ix_subscriptions_status");
        builder.HasIndex(s => s.RazorpaySubscriptionId).HasDatabaseName("ix_subscriptions_razorpay_id");
        builder.HasQueryFilter(s => s.DeletedAt == null);
    }
}
