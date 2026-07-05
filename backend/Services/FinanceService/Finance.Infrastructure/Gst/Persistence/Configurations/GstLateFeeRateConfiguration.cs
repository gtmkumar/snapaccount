using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstLateFeeRate"/>.
/// Maps to <c>gst.gst_late_fee_rate</c> (migration 101).
/// DG-GST-04: read-only rate table — no soft-delete filter.
/// </summary>
public sealed class GstLateFeeRateConfiguration : IEntityTypeConfiguration<GstLateFeeRate>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstLateFeeRate> builder)
    {
        builder.ToTable("gst_late_fee_rate");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");

        builder.Property(r => r.ReturnType)
            .HasColumnName("return_type")
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(r => r.IsNilReturn)
            .HasColumnName("is_nil_return")
            .IsRequired();

        builder.Property(r => r.PerDayAmount)
            .HasColumnName("per_day_amount")
            .HasColumnType("numeric(10,2)")
            .IsRequired();

        builder.Property(r => r.MaxCapAmount)
            .HasColumnName("max_cap_amount")
            .HasColumnType("numeric(10,2)");

        builder.Property(r => r.ValidFrom)
            .HasColumnName("valid_from")
            .IsRequired();

        builder.Property(r => r.ValidTo)
            .HasColumnName("valid_to");

        builder.Property(r => r.Notes)
            .HasColumnName("notes")
            .HasColumnType("text");

        builder.HasIndex(r => new { r.ReturnType, r.IsNilReturn })
            .HasDatabaseName("ix_gst_late_fee_rate_return_type");
        builder.HasIndex(r => r.ValidFrom)
            .HasDatabaseName("ix_gst_late_fee_rate_valid_from");
    }
}
