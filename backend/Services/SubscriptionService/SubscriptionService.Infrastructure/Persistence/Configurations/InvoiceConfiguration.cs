using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for subscription.invoices table.</summary>
public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.SubscriptionId).HasColumnName("subscription_id").IsRequired();
        builder.Property(i => i.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(i => i.InvoiceNumber).HasColumnName("invoice_number").HasMaxLength(50).IsRequired();
        builder.Property(i => i.AmountInr).HasColumnName("amount_inr").HasPrecision(12, 2).IsRequired();
        builder.Property(i => i.GstAmountInr).HasColumnName("gst_amount_inr").HasPrecision(12, 2).IsRequired();
        builder.Property(i => i.PeriodStart).HasColumnName("period_start").IsRequired();
        builder.Property(i => i.PeriodEnd).HasColumnName("period_end").IsRequired();
        builder.Property(i => i.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(i => i.RazorpayPaymentId).HasColumnName("razorpay_payment_id").HasMaxLength(100);
        builder.Property(i => i.RazorpayOrderId).HasColumnName("razorpay_order_id").HasMaxLength(100);
        builder.Property(i => i.PdfGcsUri).HasColumnName("pdf_gcs_uri").HasMaxLength(500);
        builder.Property(i => i.PaidAt).HasColumnName("paid_at");

        builder.HasIndex(i => i.OrganizationId).HasDatabaseName("ix_invoices_org_id");
        builder.HasIndex(i => i.SubscriptionId).HasDatabaseName("ix_invoices_subscription_id");
        builder.HasIndex(i => i.InvoiceNumber).IsUnique().HasDatabaseName("uq_invoices_number");
        builder.HasQueryFilter(i => i.DeletedAt == null);
    }
}
