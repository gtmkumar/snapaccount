using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ItcRecord"/> entity, mapping to <c>gst.itc_record</c>.
/// SWEEP-FIX: EF convention generated "ItcRecords" from DbSet name; DB table is "itc_record" (singular).
/// TotalItc is a C# computed property (no setter) — ignored so EF does not attempt to read/write it.
/// </summary>
public sealed class ItcRecordConfiguration : IEntityTypeConfiguration<ItcRecord>
{
    public void Configure(EntityTypeBuilder<ItcRecord> builder)
    {
        builder.ToTable("itc_record");
        builder.HasKey(r => r.Id);

        builder.Property(r => r.OrganizationId).IsRequired().HasColumnName("organization_id");
        builder.Property(r => r.GstReturnId).HasColumnName("gst_return_id");
        builder.Property(r => r.InvoiceId).HasColumnName("invoice_id");
        builder.Property(r => r.SupplierGstin).IsRequired().HasMaxLength(15).HasColumnName("supplier_gstin");
        builder.Property(r => r.SupplierName).HasMaxLength(300).HasColumnName("supplier_name");
        builder.Property(r => r.InvoiceNumber).IsRequired().HasMaxLength(50).HasColumnName("invoice_number");
        builder.Property(r => r.InvoiceDate).IsRequired().HasColumnName("invoice_date");
        builder.Property(r => r.IgstCredit).HasColumnType("numeric(20,2)").HasColumnName("igst_credit");
        builder.Property(r => r.CgstCredit).HasColumnType("numeric(20,2)").HasColumnName("cgst_credit");
        builder.Property(r => r.SgstCredit).HasColumnType("numeric(20,2)").HasColumnName("sgst_credit");
        builder.Property(r => r.CessCredit).HasColumnType("numeric(20,2)").HasColumnName("cess_credit");
        builder.Property(r => r.IsEligible).IsRequired().HasDefaultValue(true).HasColumnName("is_eligible");
        builder.Property(r => r.IneligibilityReason).HasColumnName("ineligibility_reason");
        builder.Property(r => r.Source).HasMaxLength(20).IsRequired().HasDefaultValue("GSTR_2B").HasColumnName("source");

        // TotalItc is a C# computed property (IgstCredit + CgstCredit + SgstCredit + CessCredit).
        // DB has total_itc as a plain numeric column (not generated), but EF cannot map a
        // read-only computed property to a writeable column without a setter.
        // Ignore it here; DB will store via direct column writes if needed.
        builder.Ignore(r => r.TotalItc);

        // DB also has total_itc as a stored column — shadow property for INSERT consistency
        builder.Property<decimal?>("TotalItcStored").HasColumnName("total_itc").HasColumnType("numeric(20,2)");

        builder.HasIndex(r => r.OrganizationId);
        builder.HasIndex(r => r.GstReturnId);
    }
}
