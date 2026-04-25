using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="GstRefund"/> entity, mapping to gst.gst_refund.
/// </summary>
public class GstRefundConfiguration : IEntityTypeConfiguration<GstRefund>
{
    public void Configure(EntityTypeBuilder<GstRefund> builder)
    {
        builder.ToTable("gst_refund");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.RefundType).HasColumnName("refund_type").HasMaxLength(50).IsRequired();
        builder.Property(x => x.TaxPeriod).HasColumnName("tax_period").HasMaxLength(20).IsRequired();
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.ClaimedAmount).HasColumnName("claimed_amount").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.ApprovedAmount).HasColumnName("approved_amount").HasPrecision(15, 2);
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ApplicationNumber).HasColumnName("application_number").HasMaxLength(100);
        builder.Property(x => x.FiledAt).HasColumnName("filed_at");
        builder.Property(x => x.ApprovedAt).HasColumnName("approved_at");
        builder.Property(x => x.RejectionReason).HasColumnName("rejection_reason");
        builder.Property(x => x.ArnNumber).HasColumnName("arn_number").HasMaxLength(50);
        builder.Property(x => x.BankAccountNumber).HasColumnName("bank_account_number").HasMaxLength(20);
        builder.Property(x => x.IfscCode).HasColumnName("ifsc_code").HasMaxLength(11);
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_gst_refund_user_id");
        builder.HasIndex(x => x.Status).HasDatabaseName("idx_gst_refund_status");
    }
}
