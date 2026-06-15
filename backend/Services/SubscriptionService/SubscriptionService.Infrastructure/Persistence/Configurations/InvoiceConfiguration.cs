using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for subscription.subscription_invoice table.
/// SWEEP-FIX WEB-05: table is subscription_invoice (not invoices); column names reconciled.
/// </summary>
public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("subscription_invoice");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.SubscriptionId).HasColumnName("subscription_id").IsRequired();
        builder.Property(i => i.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(i => i.InvoiceNumber).HasColumnName("invoice_number").HasMaxLength(100).IsRequired();
        // AmountInr maps to subtotal_inr in the DB.
        builder.Property(i => i.AmountInr).HasColumnName("subtotal_inr").HasPrecision(12, 2).IsRequired();
        // GstAmountInr maps to gst_amount in the DB.
        builder.Property(i => i.GstAmountInr).HasColumnName("gst_amount").HasPrecision(12, 2).IsRequired();
        // PeriodStart / PeriodEnd use the billing_ prefix in the DB.
        builder.Property(i => i.PeriodStart).HasColumnName("billing_period_start").IsRequired();
        builder.Property(i => i.PeriodEnd).HasColumnName("billing_period_end").IsRequired();
        builder.Property(i => i.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        // RazorpayPaymentId maps to razorpay_invoice_id. RazorpayOrderId has no column — ignored.
        builder.Property(i => i.RazorpayPaymentId).HasColumnName("razorpay_invoice_id").HasMaxLength(100);
        builder.Ignore(i => i.RazorpayOrderId);
        // PdfGcsUri maps to storage_path.
        builder.Property(i => i.PdfGcsUri).HasColumnName("storage_path");
        builder.Property(i => i.PaidAt).HasColumnName("paid_at");
        // DPDP anonymization columns not yet in subscription_invoice schema — ignored.
        builder.Ignore(i => i.AnonymizedAt);
        builder.Ignore(i => i.AnonymizationReason);

        builder.HasIndex(i => i.OrganizationId).HasDatabaseName("idx_sub_invoice_org_id");
        builder.HasIndex(i => i.SubscriptionId).HasDatabaseName("idx_sub_invoice_subscription_id");
        builder.HasIndex(i => i.InvoiceNumber).IsUnique().HasDatabaseName("subscription_invoice_invoice_number_key");
        builder.HasQueryFilter(i => i.DeletedAt == null);
    }
}
