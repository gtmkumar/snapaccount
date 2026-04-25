using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="LutFiling"/> entity, mapping to gst.lut_filing.
/// </summary>
public class LutFilingConfiguration : IEntityTypeConfiguration<LutFiling>
{
    public void Configure(EntityTypeBuilder<LutFiling> builder)
    {
        builder.ToTable("lut_filing");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.LutReferenceNumber).HasColumnName("lut_reference_number").HasMaxLength(50);
        builder.Property(x => x.FiledAt).HasColumnName("filed_at");
        builder.Property(x => x.ValidFrom).HasColumnName("valid_from");
        builder.Property(x => x.ValidTo).HasColumnName("valid_to");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ExportType).HasColumnName("export_type").HasMaxLength(20).IsRequired();
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.IsAutoRenewal).HasColumnName("is_auto_renewal").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_lut_filing_user_id");
        builder.HasIndex(x => x.FinancialYear).HasDatabaseName("idx_lut_filing_fy");
    }
}
