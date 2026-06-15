using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="EqualisationLevy"/> entity → itr.equalisation_levy.
/// SWEEP-FIX: previous configuration referenced columns that do not exist in DB
/// (financial_year, levy_type, levy_rate, gross_consideration, levy_amount, service_provider_name,
/// service_provider_country, quarter, is_exempt, exemption_reason).
/// DB columns verified via psql \d itr.equalisation_levy (2026-06-11).
/// </summary>
public class EqualisationLevyConfiguration : IEntityTypeConfiguration<EqualisationLevy>
{
    public void Configure(EntityTypeBuilder<EqualisationLevy> builder)
    {
        builder.ToTable("equalisation_levy");
        builder.HasKey(x => x.Id);

        // user_id UUID NOT NULL
        builder.Property(x => x.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        // organization_id UUID NOT NULL
        builder.Property(x => x.OrganizationId)
            .HasColumnName("organization_id")
            .IsRequired();

        // assessment_year VARCHAR(10) NOT NULL — entity uses FinancialYear
        builder.Property(x => x.FinancialYear)
            .HasColumnName("assessment_year")
            .HasMaxLength(10)
            .IsRequired();

        // status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasMaxLength(30)
            .IsRequired()
            .HasDefaultValue("PENDING");

        // challan_number VARCHAR(100) nullable
        builder.Property(x => x.ChallanNumber)
            .HasColumnName("challan_number")
            .HasMaxLength(100);

        // payment_date TIMESTAMPTZ nullable — maps to PaidAt
        builder.Property(x => x.PaidAt)
            .HasColumnName("payment_date");

        // due_date TIMESTAMPTZ NOT NULL — maps to DueDate
        builder.Property(x => x.DueDate)
            .HasColumnName("due_date");

        // levy_at_6_percent NUMERIC(18,2) DEFAULT 0 — maps to LevyAmount (6% levy)
        // entity.LevyType determines which column to use; use levy_at_6_percent as primary.
        // For 2% levy, use shadow property.
        builder.Property(x => x.LevyAmount)
            .HasColumnName("levy_at_6_percent")
            .HasColumnType("numeric(18,2)")
            .HasDefaultValue(0m);

        // Entity properties with no matching DB column — ignore them.
        // LevyType → DB distinguishes via levy_at_6_percent / levy_at_2_percent columns (not a type column).
        // LevyRate → no direct DB column.
        // GrossConsideration → DB uses total_payments_to_nonresidents NUMERIC(18,2) nullable.
        // ServiceProviderName / ServiceProviderCountry → no DB column.
        // Quarter → no DB column (DB uses period_from / period_to).
        // IsExempt / ExemptionReason → no DB column.
        // DDL HANDOFF (db-engineer):
        //   add levy_type VARCHAR(30) to itr.equalisation_levy
        //   add levy_rate NUMERIC(5,2) to itr.equalisation_levy
        //   add quarter VARCHAR(5) to itr.equalisation_levy
        //   add is_exempt BOOLEAN NOT NULL DEFAULT false to itr.equalisation_levy
        //   add exemption_reason TEXT to itr.equalisation_levy
        //   add service_provider_name VARCHAR(300) to itr.equalisation_levy
        //   add service_provider_country VARCHAR(100) to itr.equalisation_levy
        builder.Ignore(x => x.LevyType);
        builder.Ignore(x => x.LevyRate);
        builder.Ignore(x => x.GrossConsideration);
        builder.Ignore(x => x.ServiceProviderName);
        builder.Ignore(x => x.ServiceProviderCountry);
        builder.Ignore(x => x.Quarter);
        builder.Ignore(x => x.IsExempt);
        builder.Ignore(x => x.ExemptionReason);

        // Shadow properties for DB columns without entity properties
        // period_from TIMESTAMPTZ NOT NULL
        builder.Property<DateTime>("PeriodFrom")
            .HasColumnName("period_from")
            .IsRequired()
            .HasDefaultValueSql("now()");

        // period_to TIMESTAMPTZ NOT NULL
        builder.Property<DateTime>("PeriodTo")
            .HasColumnName("period_to")
            .IsRequired()
            .HasDefaultValueSql("now()");

        // total_payments_to_nonresidents NUMERIC(18,2) nullable
        builder.Property<decimal?>("TotalPaymentsToNonresidents")
            .HasColumnName("total_payments_to_nonresidents")
            .HasColumnType("numeric(18,2)");

        // levy_at_2_percent NUMERIC(18,2) DEFAULT 0
        builder.Property<decimal?>("LevyAt2Percent")
            .HasColumnName("levy_at_2_percent")
            .HasColumnType("numeric(18,2)")
            .HasDefaultValue(0m);

        // total_levy NUMERIC(18,2) nullable
        builder.Property<decimal?>("TotalLevy")
            .HasColumnName("total_levy")
            .HasColumnType("numeric(18,2)");

        // form1_filing_date TIMESTAMPTZ nullable
        builder.Property<DateTime?>("Form1FilingDate")
            .HasColumnName("form1_filing_date");

        // pan_of_payee VARCHAR(10) nullable — check: PAN format
        builder.Property<string?>("PanOfPayee")
            .HasColumnName("pan_of_payee")
            .HasMaxLength(10);

        // remarks TEXT nullable
        builder.Property<string?>("Remarks")
            .HasColumnName("remarks");

        // assigned_to UUID nullable
        builder.Property<Guid?>("AssignedTo")
            .HasColumnName("assigned_to");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_eq_levy_user_id");
        builder.HasIndex(x => x.OrganizationId).HasDatabaseName("idx_eq_levy_org_id");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
