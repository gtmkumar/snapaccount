using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="LowerTdsCertificate"/> entity, mapping to itr.lower_tds_certificate.
/// </summary>
public class LowerTdsCertificateConfiguration : IEntityTypeConfiguration<LowerTdsCertificate>
{
    public void Configure(EntityTypeBuilder<LowerTdsCertificate> builder)
    {
        builder.ToTable("lower_tds_certificate");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.AssessmentYear).HasColumnName("assessment_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.Section).HasColumnName("section").HasMaxLength(10).IsRequired();
        builder.Property(x => x.DeductorName).HasColumnName("deductor_name").HasMaxLength(300);
        builder.Property(x => x.DeductorTan).HasColumnName("deductor_tan").HasMaxLength(10);
        builder.Property(x => x.EstimatedIncome).HasColumnName("estimated_income").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.EstimatedTaxLiability).HasColumnName("estimated_tax_liability").HasPrecision(15, 2).IsRequired();
        builder.Property(x => x.CertificateRate).HasColumnName("certificate_rate").HasPrecision(5, 2);
        builder.Property(x => x.CertificateNumber).HasColumnName("certificate_number").HasMaxLength(50);
        builder.Property(x => x.ValidFrom).HasColumnName("valid_from");
        builder.Property(x => x.ValidTo).HasColumnName("valid_to");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.ApplicationNumber).HasColumnName("application_number").HasMaxLength(50);
        builder.Property(x => x.ApplicationDate).HasColumnName("application_date");
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_lower_tds_cert_user_id");
    }
}
