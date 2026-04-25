using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="AdvanceTax"/> entity, mapping to itr.advance_tax.
/// </summary>
public class AdvanceTaxConfiguration : IEntityTypeConfiguration<AdvanceTax>
{
    public void Configure(EntityTypeBuilder<AdvanceTax> builder)
    {
        builder.ToTable("advance_tax");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.AssessmentYear).HasColumnName("assessment_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.Installment).HasColumnName("installment").HasMaxLength(10).IsRequired();
        builder.Property(x => x.DueDate).HasColumnName("due_date").IsRequired();
        builder.Property(x => x.EstimatedIncome).HasColumnName("estimated_income").HasPrecision(15, 2);
        builder.Property(x => x.TaxLiability).HasColumnName("tax_liability").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.PaidAmount).HasColumnName("paid_amount").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.ChallanAmount).HasColumnName("challan_amount").HasPrecision(15, 2);
        builder.Property(x => x.ChallanNumber).HasColumnName("challan_number").HasMaxLength(50);
        builder.Property(x => x.BsrCode).HasColumnName("bsr_code").HasMaxLength(20);
        builder.Property(x => x.PaidAt).HasColumnName("paid_at");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.InterestU234B).HasColumnName("interest_u234b").HasPrecision(15, 2);
        builder.Property(x => x.InterestU234C).HasColumnName("interest_u234c").HasPrecision(15, 2);
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_advance_tax_user_id");
        builder.HasIndex(x => x.AssessmentYear).HasDatabaseName("idx_advance_tax_ay");
    }
}
