using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstOrgProfile"/>.
/// Maps to <c>gst.gst_org_profile</c> (migration 102).
/// DG-GST-05: per-org annual turnover for e-invoice threshold gate.
/// </summary>
public sealed class GstOrgProfileConfiguration : IEntityTypeConfiguration<GstOrgProfile>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstOrgProfile> builder)
    {
        builder.ToTable("gst_org_profile");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");

        builder.Property(p => p.OrganizationId)
            .HasColumnName("organization_id")
            .IsRequired();

        builder.Property(p => p.AnnualTurnoverCr)
            .HasColumnName("annual_turnover_cr")
            .HasColumnType("numeric(18,2)");

        builder.Property(p => p.EInvoiceEnabled)
            .HasColumnName("einvoice_enabled")
            .IsRequired();

        builder.Property(p => p.EffectiveFromFy)
            .HasColumnName("effective_from_fy")
            .HasMaxLength(10);

        // BaseAuditableEntity audit columns
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by").HasConversion<string>();
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by").HasConversion<string>();

        builder.HasIndex(p => p.OrganizationId)
            .IsUnique()
            .HasDatabaseName("ix_gst_org_profile_org_id");
    }
}
