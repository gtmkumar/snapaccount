using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ItcMismatch"/> → <c>gst.itc_mismatch</c>.
///
/// SWEEP-FIX WEB-02: <c>difference_amount</c> is a PostgreSQL GENERATED ALWAYS AS column
/// (claimed_amount - available_amount). EF must not write to it. The C# property
/// <see cref="ItcMismatch.DifferenceAmount"/> is a computed property with no setter —
/// EF 10 convention excludes it automatically, but we explicitly ignore it here for safety.
///
/// Table name is singular: <c>itc_mismatch</c> (not <c>itc_mismatches</c>).
/// </summary>
public sealed class ItcMismatchConfiguration : IEntityTypeConfiguration<ItcMismatch>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<ItcMismatch> builder)
    {
        builder.ToTable("itc_mismatch");

        builder.HasKey(m => m.Id);
        builder.Property(m => m.Id).HasColumnName("id");

        builder.Property(m => m.OrganizationId).IsRequired().HasColumnName("organization_id");
        builder.Property(m => m.ItcRecordId).HasColumnName("itc_record_id");
        builder.Property(m => m.MismatchType).IsRequired().HasMaxLength(50).HasColumnName("mismatch_type");
        builder.Property(m => m.ClaimedAmount).IsRequired().HasColumnType("numeric(20,2)").HasColumnName("claimed_amount");
        builder.Property(m => m.AvailableAmount).IsRequired().HasColumnType("numeric(20,2)").HasColumnName("available_amount");
        builder.Property(m => m.Status).IsRequired().HasMaxLength(50).HasDefaultValue("OPEN").HasColumnName("status");
        builder.Property(m => m.ResolutionNotes).HasColumnName("resolution_notes");
        builder.Property(m => m.ResolvedAt).HasColumnName("resolved_at");
        builder.Property(m => m.ResolvedBy).HasColumnName("resolved_by");

        // WEB-02: difference_amount is a DB-generated column (GENERATED ALWAYS AS).
        // The C# DifferenceAmount property is a computed expression — EF must not attempt
        // to read or write this column. Ignore it from the EF model entirely; callers
        // compute the difference in C# from ClaimedAmount and AvailableAmount.
        builder.Ignore(m => m.DifferenceAmount);

        // Audit columns.
        builder.Property(m => m.CreatedAt).HasColumnName("created_at");
        builder.Property(m => m.UpdatedAt).HasColumnName("updated_at");
        builder.Property(m => m.DeletedAt).HasColumnName("deleted_at");
        builder.Property(m => m.CreatedBy).HasColumnName("created_by");
        builder.Property(m => m.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(m => m.OrganizationId);
        builder.HasIndex(m => m.Status);
        builder.HasQueryFilter(m => m.DeletedAt == null);
    }
}
