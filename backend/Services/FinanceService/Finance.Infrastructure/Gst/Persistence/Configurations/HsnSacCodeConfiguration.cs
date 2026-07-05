using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="HsnSacCode"/>.
/// Maps the <c>gst.hsn_sac_codes</c> table (migration 020) plus the
/// <c>tax_rate_name</c> column added in migration 108 (DG-GST-06).
/// </summary>
public sealed class HsnSacCodeConfiguration : IEntityTypeConfiguration<HsnSacCode>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<HsnSacCode> builder)
    {
        builder.ToTable("hsn_sac_codes");

        builder.Property(h => h.Code)
            .HasColumnName("code")
            .HasMaxLength(20)
            .IsRequired();

        builder.HasIndex(h => h.Code)
            .IsUnique()
            .HasDatabaseName("idx_hsn_sac_codes_code");

        builder.Property(h => h.CodeType)
            .HasColumnName("code_type")
            .HasMaxLength(10)
            .IsRequired();

        builder.Property(h => h.Description)
            .HasColumnName("description")
            .IsRequired();

        // Legacy flat rate — kept as fallback when tax_rate_name is null.
        builder.Property(h => h.GstRatePct)
            .HasColumnName("default_gst_rate_pct")
            .HasColumnType("numeric(5,2)");

        // DG-GST-06: Named link to gst.gst_tax_rate for temporal rate resolution.
        // Nullable so that existing rows without a mapped rate name continue to work
        // (fallback to default_gst_rate_pct).
        builder.Property(h => h.TaxRateName)
            .HasColumnName("tax_rate_name")
            .HasMaxLength(100);

        builder.Property(h => h.IsActive)
            .HasColumnName("is_active")
            .HasDefaultValue(true)
            .IsRequired();

        // Index to speed up temporal rate lookups scoped to a rate name.
        builder.HasIndex(h => h.TaxRateName)
            .HasDatabaseName("ix_hsn_sac_codes_tax_rate_name")
            .HasFilter("tax_rate_name IS NOT NULL");
    }
}
