using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstInterestRate"/>.
/// Maps to <c>gst.gst_interest_rate</c> (migration 101).
/// DG-GST-04: read-only rate table — no audit or soft-delete columns.
/// </summary>
public sealed class GstInterestRateConfiguration : IEntityTypeConfiguration<GstInterestRate>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstInterestRate> builder)
    {
        builder.ToTable("gst_interest_rate");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");

        builder.Property(r => r.RatePct)
            .HasColumnName("rate_pct")
            .HasColumnType("numeric(5,2)")
            .IsRequired();

        builder.Property(r => r.ValidFrom)
            .HasColumnName("valid_from")
            .IsRequired();

        builder.Property(r => r.ValidTo)
            .HasColumnName("valid_to");

        builder.Property(r => r.Notes)
            .HasColumnName("notes")
            .HasColumnType("text");

        builder.HasIndex(r => r.ValidFrom)
            .HasDatabaseName("ix_gst_interest_rate_valid_from");
    }
}
