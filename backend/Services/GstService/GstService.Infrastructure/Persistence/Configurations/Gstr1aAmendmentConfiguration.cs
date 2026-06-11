using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Gstr1aAmendment"/>.
/// Maps to <c>gst.gstr1a_amendments</c>.
///
/// DDL note: Requires db-engineer DDL handoff. 7-year retention.
/// RLS: scoped to <c>organization_id</c>.
/// </summary>
public sealed class Gstr1aAmendmentConfiguration : IEntityTypeConfiguration<Gstr1aAmendment>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Gstr1aAmendment> builder)
    {
        builder.ToTable("gstr1a_amendments");

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id");

        builder.Property(a => a.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(a => a.OriginalImsInvoiceId).HasColumnName("original_ims_invoice_id");
        builder.Property(a => a.OriginalInvoiceNumber).HasColumnName("original_invoice_number").HasMaxLength(50).IsRequired();
        builder.Property(a => a.OriginalSupplierGstin).HasColumnName("original_supplier_gstin").HasMaxLength(15).IsRequired();
        builder.Property(a => a.AmendmentType).HasColumnName("amendment_type").HasMaxLength(30).IsRequired();
        builder.Property(a => a.AmendmentPayloadJson).HasColumnName("amendment_payload_json").HasColumnType("jsonb").IsRequired();
        builder.Property(a => a.Period).HasColumnName("period").HasMaxLength(6).IsRequired();
        builder.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(a => a.ArnNumber).HasColumnName("arn_number").HasMaxLength(50);
        builder.Property(a => a.FiledAt).HasColumnName("filed_at");

        // Audit columns (BaseAuditableEntity)
        builder.Property(a => a.CreatedAt).HasColumnName("created_at");
        builder.Property(a => a.UpdatedAt).HasColumnName("updated_at");
        builder.Property(a => a.DeletedAt).HasColumnName("deleted_at");
        builder.Property(a => a.CreatedBy).HasColumnName("created_by").HasMaxLength(128);
        builder.Property(a => a.UpdatedBy).HasColumnName("updated_by").HasMaxLength(128);

        // Soft-delete filter
        builder.HasQueryFilter(a => a.DeletedAt == null);

        // Indexes
        builder.HasIndex(a => new { a.OrganizationId, a.Period })
            .HasDatabaseName("ix_gstr1a_amendments_org_period");
        builder.HasIndex(a => new { a.OrganizationId, a.Status })
            .HasDatabaseName("ix_gstr1a_amendments_org_status");
        builder.HasIndex(a => a.OriginalImsInvoiceId)
            .HasDatabaseName("ix_gstr1a_amendments_original_ims_invoice");
    }
}
