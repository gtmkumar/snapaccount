using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="GstAnnualReturn"/> entity, mapping to gst.gst_annual_return.
/// </summary>
public class GstAnnualReturnConfiguration : IEntityTypeConfiguration<GstAnnualReturn>
{
    public void Configure(EntityTypeBuilder<GstAnnualReturn> builder)
    {
        builder.ToTable("gst_annual_return");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.FormType).HasColumnName("form_type").HasMaxLength(10).IsRequired();
        builder.Property(x => x.TotalTurnover).HasColumnName("total_turnover").HasPrecision(15, 2);
        builder.Property(x => x.TotalTaxPaid).HasColumnName("total_tax_paid").HasPrecision(15, 2);
        builder.Property(x => x.TotalItcClaimed).HasColumnName("total_itc_claimed").HasPrecision(15, 2);
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ArnNumber).HasColumnName("arn_number").HasMaxLength(50);
        builder.Property(x => x.FiledAt).HasColumnName("filed_at");
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.IsReconciled).HasColumnName("is_reconciled").IsRequired();
        builder.Property(x => x.ReconciledAt).HasColumnName("reconciled_at");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_gst_annual_return_user_id");
        builder.HasIndex(x => x.FinancialYear).HasDatabaseName("idx_gst_annual_return_fy");
    }
}
