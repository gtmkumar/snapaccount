using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// GAP-022: EF Core configuration for <see cref="GstTaxRate"/>.
/// Maps the temporal-table columns used for effective-dated GST rate management.
/// Schema is inherited from <c>GstDbContext.HasDefaultSchema("gst")</c>.
/// </summary>
public sealed class GstTaxRateConfiguration : IEntityTypeConfiguration<GstTaxRate>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstTaxRate> builder)
    {
        builder.ToTable("gst_tax_rate");

        builder.Property(r => r.RateName)
            .HasColumnName("rate_name")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(r => r.RatePct)
            .HasColumnName("rate_pct")
            .HasColumnType("numeric(5,2)")
            .IsRequired();

        builder.Property(r => r.CgstPct)
            .HasColumnName("cgst_pct")
            .HasColumnType("numeric(5,2)")
            .IsRequired();

        builder.Property(r => r.SgstPct)
            .HasColumnName("sgst_pct")
            .HasColumnType("numeric(5,2)")
            .IsRequired();

        builder.Property(r => r.IgstPct)
            .HasColumnName("igst_pct")
            .HasColumnType("numeric(5,2)")
            .IsRequired();

        builder.Property(r => r.CessPct)
            .HasColumnName("cess_pct")
            .HasColumnType("numeric(5,2)");

        builder.Property(r => r.ValidFrom)
            .HasColumnName("valid_from")
            .IsRequired();

        builder.Property(r => r.ValidTo)
            .HasColumnName("valid_to");

        builder.Property(r => r.IsActive)
            .HasColumnName("is_active")
            .HasDefaultValue(true)
            .IsRequired();

        builder.Property(r => r.Notes)
            .HasColumnName("notes")
            .HasMaxLength(1000);

        // Index for effective-date lookups — the primary access pattern for rate resolution
        builder.HasIndex(r => new { r.RateName, r.ValidFrom })
            .HasDatabaseName("ix_gst_tax_rate_name_valid_from");

        builder.HasIndex(r => new { r.RateName, r.ValidTo })
            .HasDatabaseName("ix_gst_tax_rate_name_valid_to");
    }
}
