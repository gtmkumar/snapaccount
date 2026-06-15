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
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ArnNumber).HasColumnName("arn_number").HasMaxLength(50);
        builder.Property(x => x.BankAccountNumber).HasColumnName("bank_account_number").HasMaxLength(20);
        builder.Property(x => x.IfscCode).HasColumnName("ifsc_code").HasMaxLength(11);

        // SWEEP-FIX: ClaimedAmount → refund_amount (column name differs in DB)
        builder.Property(x => x.ClaimedAmount).HasColumnName("refund_amount").HasPrecision(15, 2).IsRequired();

        // SWEEP-FIX: ApprovedAmount → sanctioned_amount (column name differs in DB)
        builder.Property(x => x.ApprovedAmount).HasColumnName("sanctioned_amount").HasPrecision(15, 2);

        // SWEEP-FIX: ApprovedAt → final_order_date (column name differs in DB)
        builder.Property(x => x.ApprovedAt).HasColumnName("final_order_date");

        // SWEEP-FIX: RejectionReason → remarks (column name differs in DB); Notes also maps to remarks
        // Entity has separate Notes and RejectionReason; DB has a single remarks column.
        // Map RejectionReason to remarks; ignore Notes (no distinct column).
        builder.Property(x => x.RejectionReason).HasColumnName("remarks");

        // SWEEP-FIX: TaxPeriod is a string like "2025-Q1" — DB uses tax_period_from/tax_period_to
        //            (TIMESTAMPTZ pair). No single varchar column exists for TaxPeriod.
        //            FiledAt also has no filed_at column in DB (application_date is the closest).
        //            ApplicationNumber has no column in DB.
        // DDL HANDOFF (db-engineer): add to gst.gst_refund:
        //   tax_period VARCHAR(20) NULL  -- for "2025-Q1" format TaxPeriod
        //   filed_at TIMESTAMPTZ NULL
        //   application_number VARCHAR(100) NULL
        builder.Ignore(x => x.TaxPeriod);
        builder.Ignore(x => x.FiledAt);
        builder.Ignore(x => x.ApplicationNumber);
        builder.Ignore(x => x.Notes); // covered by remarks via RejectionReason mapping

        // DB additional columns — shadow properties
        builder.Property<DateTime?>("ApplicationDate").HasColumnName("application_date");
        builder.Property<Guid?>("AssignedTo").HasColumnName("assigned_to");
        builder.Property<string?>("PortalStatus").HasColumnName("portal_status").HasMaxLength(50);
        builder.Property<decimal?>("RejectedAmount").HasColumnName("rejected_amount").HasColumnType("numeric(15,2)");

        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_gst_refund_user_id");
        builder.HasIndex(x => x.Status).HasDatabaseName("idx_gst_refund_status");
    }
}
