using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="TransferPricingReport"/> entity,
/// mapping to itr.transfer_pricing_report.
/// </summary>
public class TransferPricingReportConfiguration : IEntityTypeConfiguration<TransferPricingReport>
{
    public void Configure(EntityTypeBuilder<TransferPricingReport> builder)
    {
        builder.ToTable("transfer_pricing_report");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.AssessmentYear).HasColumnName("assessment_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.ReportType).HasColumnName("report_type").HasMaxLength(20).IsRequired();
        builder.Property(x => x.InternationalTransactionValue).HasColumnName("international_transaction_value").HasPrecision(18, 2);
        builder.Property(x => x.DomesticTransactionValue).HasColumnName("domestic_transaction_value").HasPrecision(18, 2);
        builder.Property(x => x.PricingMethod).HasColumnName("pricing_method").HasMaxLength(10);
        builder.Property(x => x.CaName).HasColumnName("ca_name").HasMaxLength(300);
        builder.Property(x => x.CaMembershipNumber).HasColumnName("ca_membership_number").HasMaxLength(20);
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.FiledAt).HasColumnName("filed_at");
        builder.Property(x => x.AcknowledgementNumber).HasColumnName("acknowledgement_number").HasMaxLength(50);
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_transfer_pricing_user_id");
    }
}
