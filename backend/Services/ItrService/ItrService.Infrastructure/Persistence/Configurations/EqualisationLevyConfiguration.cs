using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="EqualisationLevy"/> entity,
/// mapping to itr.equalisation_levy.
/// </summary>
public class EqualisationLevyConfiguration : IEntityTypeConfiguration<EqualisationLevy>
{
    public void Configure(EntityTypeBuilder<EqualisationLevy> builder)
    {
        builder.ToTable("equalisation_levy");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.LevyType).HasColumnName("levy_type").HasMaxLength(30).IsRequired();
        builder.Property(x => x.LevyRate).HasColumnName("levy_rate").HasPrecision(5, 2).IsRequired();
        builder.Property(x => x.GrossConsideration).HasColumnName("gross_consideration").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.LevyAmount).HasColumnName("levy_amount").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.ServiceProviderName).HasColumnName("service_provider_name").HasMaxLength(300);
        builder.Property(x => x.ServiceProviderCountry).HasColumnName("service_provider_country").HasMaxLength(100);
        builder.Property(x => x.Quarter).HasColumnName("quarter").HasMaxLength(5).IsRequired();
        builder.Property(x => x.DueDate).HasColumnName("due_date");
        builder.Property(x => x.PaidAt).HasColumnName("paid_at");
        builder.Property(x => x.ChallanNumber).HasColumnName("challan_number").HasMaxLength(50);
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.IsExempt).HasColumnName("is_exempt").IsRequired();
        builder.Property(x => x.ExemptionReason).HasColumnName("exemption_reason");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_equalisation_levy_user_id");
    }
}
