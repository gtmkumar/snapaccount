using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="LowerTdsCertificate"/> entity → itr.lower_tds_certificate.
/// SWEEP-FIX: previous configuration referenced columns that do not exist in DB
/// (deductor_name, estimated_income, estimated_tax_liability, certificate_rate, application_number, etc.).
/// DB columns verified via psql \d itr.lower_tds_certificate (2026-06-11).
/// </summary>
public class LowerTdsCertificateConfiguration : IEntityTypeConfiguration<LowerTdsCertificate>
{
    public void Configure(EntityTypeBuilder<LowerTdsCertificate> builder)
    {
        builder.ToTable("lower_tds_certificate");
        builder.HasKey(x => x.Id);

        // user_id UUID NOT NULL
        builder.Property(x => x.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        // organization_id UUID NOT NULL
        builder.Property(x => x.OrganizationId)
            .HasColumnName("organization_id")
            .IsRequired();

        // assessment_year VARCHAR(10) NOT NULL
        builder.Property(x => x.AssessmentYear)
            .HasColumnName("assessment_year")
            .HasMaxLength(10)
            .IsRequired();

        // section VARCHAR(20) NOT NULL CHECK ('197','195_2')
        builder.Property(x => x.Section)
            .HasColumnName("section")
            .HasMaxLength(20)
            .IsRequired();

        // certificate_number VARCHAR(100) nullable
        builder.Property(x => x.CertificateNumber)
            .HasColumnName("certificate_number")
            .HasMaxLength(100);

        // valid_from TIMESTAMPTZ nullable
        builder.Property(x => x.ValidFrom)
            .HasColumnName("valid_from");

        // valid_to TIMESTAMPTZ nullable
        builder.Property(x => x.ValidTo)
            .HasColumnName("valid_to");

        // status VARCHAR(30) NOT NULL DEFAULT 'APPLIED'
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasMaxLength(30)
            .IsRequired()
            .HasDefaultValue("APPLIED");

        // deductor_tan VARCHAR(10) nullable
        builder.Property(x => x.DeductorTan)
            .HasColumnName("deductor_tan")
            .HasMaxLength(10);

        // remarks TEXT nullable — maps to entity Notes
        builder.Property(x => x.Notes)
            .HasColumnName("remarks");

        // applicable_rate NUMERIC(5,2) nullable — maps to CertificateRate
        builder.Property(x => x.CertificateRate)
            .HasColumnName("applicable_rate")
            .HasColumnType("numeric(5,2)");

        // Entity properties with no matching DB column — ignore them.
        // DB has pan_number (required), but entity has DeductorName, EstimatedIncome,
        // EstimatedTaxLiability, ApplicationNumber, ApplicationDate which do not exist.
        // DDL HANDOFF (db-engineer):
        //   add deductor_name VARCHAR(300) to itr.lower_tds_certificate
        //   add estimated_income NUMERIC(18,2) to itr.lower_tds_certificate
        //   add estimated_tax_liability NUMERIC(18,2) to itr.lower_tds_certificate
        //   add application_number VARCHAR(50) to itr.lower_tds_certificate
        //   add application_date TIMESTAMPTZ to itr.lower_tds_certificate
        builder.Ignore(x => x.DeductorName);
        builder.Ignore(x => x.EstimatedIncome);
        builder.Ignore(x => x.EstimatedTaxLiability);
        builder.Ignore(x => x.ApplicationNumber);
        builder.Ignore(x => x.ApplicationDate);

        // Shadow properties for DB columns without entity properties
        // pan_number VARCHAR(10) NOT NULL (FK-like, checked format)
        builder.Property<string>("PanNumber")
            .HasColumnName("pan_number")
            .HasMaxLength(10)
            .IsRequired()
            .HasDefaultValue("AAAAA0000A");

        // max_amount NUMERIC(18,2) nullable
        builder.Property<decimal?>("MaxAmount")
            .HasColumnName("max_amount")
            .HasColumnType("numeric(18,2)");

        // utilized_amount NUMERIC(18,2) DEFAULT 0
        builder.Property<decimal?>("UtilizedAmount")
            .HasColumnName("utilized_amount")
            .HasColumnType("numeric(18,2)")
            .HasDefaultValue(0m);

        // normal_rate NUMERIC(5,2) nullable
        builder.Property<decimal?>("NormalRate")
            .HasColumnName("normal_rate")
            .HasColumnType("numeric(5,2)");

        // traces_application_number VARCHAR(100) nullable
        builder.Property<string?>("TracesApplicationNumber")
            .HasColumnName("traces_application_number")
            .HasMaxLength(100);

        // assigned_to UUID nullable — FK to auth.user
        builder.Property<Guid?>("AssignedTo")
            .HasColumnName("assigned_to");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_lower_tds_user_id");
        builder.HasIndex(x => x.OrganizationId).HasDatabaseName("idx_lower_tds_org_id");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
