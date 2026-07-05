using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ImsInvoice"/>.
/// Maps to <c>gst.ims_invoices</c>.
///
/// DDL note: Table requires the db-engineer DDL handoff (see final report).
/// Soft-delete global filter is inherited from <c>BaseDbContext</c>.
/// RLS policy: <c>gst.ims_invoices</c> must enforce <c>organization_id = current_setting('app.current_org_id')</c>.
/// </summary>
public sealed class ImsInvoiceConfiguration : IEntityTypeConfiguration<ImsInvoice>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<ImsInvoice> builder)
    {
        builder.ToTable("ims_invoices");

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasColumnName("id");

        builder.Property(i => i.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(i => i.SupplierGstin).HasColumnName("supplier_gstin").HasMaxLength(15).IsRequired();
        builder.Property(i => i.SupplierName).HasColumnName("supplier_name").HasMaxLength(200).IsRequired();
        builder.Property(i => i.InvoiceNumber).HasColumnName("invoice_number").HasMaxLength(50).IsRequired();
        builder.Property(i => i.InvoiceDate).HasColumnName("invoice_date").IsRequired();
        builder.Property(i => i.InvoiceValue).HasColumnName("invoice_value").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.TaxableValue).HasColumnName("taxable_value").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.IgstAmount).HasColumnName("igst_amount").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.CgstAmount).HasColumnName("cgst_amount").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.SgstAmount).HasColumnName("sgst_amount").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.CessAmount).HasColumnName("cess_amount").HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(i => i.Period).HasColumnName("period").HasMaxLength(6).IsRequired();
        builder.Property(i => i.Source).HasColumnName("source").HasMaxLength(20).IsRequired();
        builder.Property(i => i.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(i => i.ActionedAt).HasColumnName("actioned_at");
        builder.Property(i => i.ActionedBy).HasColumnName("actioned_by");
        builder.Property(i => i.DeemedAccepted).HasColumnName("deemed_accepted").HasDefaultValue(false).IsRequired();
        builder.Property(i => i.RejectionReason).HasColumnName("rejection_reason").HasMaxLength(500);

        // Audit columns (BaseAuditableEntity)
        builder.Property(i => i.CreatedAt).HasColumnName("created_at");
        builder.Property(i => i.UpdatedAt).HasColumnName("updated_at");
        builder.Property(i => i.DeletedAt).HasColumnName("deleted_at");

        // W5-IMS-02 fix: created_by / updated_by are character varying(128) in
        // gst.ims_invoices (migration 074 used varchar for Firebase UIDs, not uuid).
        // BaseDbContext applies GuidStringConverter globally to all BaseAuditableEntity
        // subtype's CreatedBy/UpdatedBy properties — that converter tells Npgsql to
        // read the column as a uuid provider type, causing InvalidCastException when
        // the underlying column is varchar. Override with identity HasConversion<string>()
        // so no conversion is applied and Npgsql reads the column as text (correct).
        builder.Property(i => i.CreatedBy)
            .HasColumnName("created_by")
            .HasMaxLength(128)
            .HasColumnType("character varying")
            .HasConversion<string>();
        builder.Property(i => i.UpdatedBy)
            .HasColumnName("updated_by")
            .HasMaxLength(128)
            .HasColumnType("character varying")
            .HasConversion<string>();

        // Soft-delete filter
        builder.HasQueryFilter(i => i.DeletedAt == null);

        // Indexes
        builder.HasIndex(i => new { i.OrganizationId, i.Period })
            .HasDatabaseName("ix_ims_invoices_org_period");
        builder.HasIndex(i => new { i.OrganizationId, i.Status })
            .HasDatabaseName("ix_ims_invoices_org_status");
        // Uniqueness: one row per (org, supplier_gstin, invoice_number, period)
        builder.HasIndex(i => new { i.OrganizationId, i.SupplierGstin, i.InvoiceNumber, i.Period })
            .IsUnique()
            .HasDatabaseName("uix_ims_invoices_org_supplier_invoice_period");
    }
}
