using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="TaxComputation"/> → itr.tax_computation.
/// SWEEP-FIX: Entity had NO configuration — EF fell back to default table name "TaxComputations"
/// which does not exist; real table is itr.tax_computation.
/// DB columns verified via psql \d itr.tax_computation (2026-06-11).
/// Note: itr.tax_computation FKs to itr.itr_return (a legacy table not managed by this service's EF).
/// ItrReturnId is mapped as a plain UUID property with no navigation to avoid FK resolution issues.
/// </summary>
public sealed class TaxComputationConfiguration : IEntityTypeConfiguration<TaxComputation>
{
    public void Configure(EntityTypeBuilder<TaxComputation> builder)
    {
        builder.ToTable("tax_computation");
        builder.HasKey(x => x.Id);

        // itr_return_id UUID NOT NULL FK → itr.itr_return(id) (legacy table, no EF navigation)
        builder.Property(x => x.ItrReturnId)
            .HasColumnName("itr_return_id")
            .IsRequired();

        // user_id is a domain property but DB uses itr_return_id for user scoping.
        // Entity.UserId has no matching column — ignore it.
        // DDL HANDOFF (db-engineer): add user_id UUID NOT NULL REFERENCES auth."user"(id) to
        // itr.tax_computation if direct user scoping is needed.
        builder.Ignore(x => x.UserId);

        // assessment_year is a domain property but DB has no assessment_year column —
        // it's derivable from itr_return. Ignore it.
        builder.Ignore(x => x.AssessmentYear);

        // gross_salary NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property(x => x.GrossSalaryIncome)
            .HasColumnName("gross_salary")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // No DB column for HousePropertyIncome, BusinessProfessionalIncome,
        // CapitalGainsIncome, OtherSourcesIncome — DB splits these as salary/deductions only.
        // Map to shadow numeric columns or ignore non-existent ones.
        // DB has: house_rent_allowance, leave_travel_allowance, other_allowances — map closest.
        builder.Ignore(x => x.HousePropertyIncome);
        builder.Ignore(x => x.BusinessProfessionalIncome);
        builder.Ignore(x => x.CapitalGainsIncome);
        builder.Ignore(x => x.OtherSourcesIncome);

        // total_deductions NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property(x => x.TotalDeductions)
            .HasColumnName("total_deductions")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // taxable_income NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property(x => x.TaxableIncome)
            .HasColumnName("taxable_income")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // total_tax_liability NUMERIC(20,2) NOT NULL DEFAULT 0 — maps to TaxPayable
        builder.Property(x => x.TaxPayable)
            .HasColumnName("total_tax_liability")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // tds_deducted NUMERIC(20,2) NOT NULL DEFAULT 0 — maps to TaxAlreadyPaid
        builder.Property(x => x.TaxAlreadyPaid)
            .HasColumnName("tds_deducted")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // net_payable_or_refund NUMERIC(20,2) NOT NULL DEFAULT 0 — maps to TaxRefundOrDue
        builder.Property(x => x.TaxRefundOrDue)
            .HasColumnName("net_payable_or_refund")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // recommendation_reason TEXT nullable — maps to Regime (closest semantic; DB has no regime column)
        // Actually Regime should map to is_recommended context. DB has no "regime" column.
        // Ignore Regime (it's a domain concept redundantly stored; derive from itr_return).
        builder.Ignore(x => x.Regime);

        // ComputationHash has no DB column in itr.tax_computation (column is on itr.filings).
        // Ignore it.
        builder.Ignore(x => x.ComputationHash);

        // Shadow properties for DB columns without entity properties
        // tax_regime_id UUID NOT NULL — FK to itr.tax_regime (legacy table, no EF navigation)
        builder.Property<Guid>("TaxRegimeId")
            .HasColumnName("tax_regime_id")
            .IsRequired()
            .HasDefaultValueSql("gen_random_uuid()");

        // standard_deduction NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("StandardDeduction")
            .HasColumnName("standard_deduction")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // house_rent_allowance NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("HouseRentAllowance")
            .HasColumnName("house_rent_allowance")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // leave_travel_allowance NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("LeaveTravelAllowance")
            .HasColumnName("leave_travel_allowance")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // other_allowances NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("OtherAllowances")
            .HasColumnName("other_allowances")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // net_salary NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("NetSalary")
            .HasColumnName("net_salary")
            .HasColumnType("numeric(20,2)")
            .HasDefaultValue(0m);

        // deduction_80c / 80d / 80e / 80g / nps_80ccd / hra / home_loan — all NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("Deduction80C").HasColumnName("deduction_80c").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("Deduction80D").HasColumnName("deduction_80d").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("Deduction80E").HasColumnName("deduction_80e").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("Deduction80G").HasColumnName("deduction_80g").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("DeductionNps80Ccd").HasColumnName("deduction_nps_80ccd").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("DeductionHra").HasColumnName("deduction_hra").HasColumnType("numeric(20,2)").HasDefaultValue(0m);
        builder.Property<decimal>("DeductionHomeLoan").HasColumnName("deduction_home_loan").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // tax_before_rebate NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("TaxBeforeRebate").HasColumnName("tax_before_rebate").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // rebate_87a NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("Rebate87A").HasColumnName("rebate_87a").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // tax_after_rebate NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("TaxAfterRebate").HasColumnName("tax_after_rebate").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // surcharge NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("Surcharge").HasColumnName("surcharge").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // cess NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("Cess").HasColumnName("cess").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // advance_tax NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("AdvanceTax").HasColumnName("advance_tax").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // self_assessment_tax NUMERIC(20,2) NOT NULL DEFAULT 0
        builder.Property<decimal>("SelfAssessmentTax").HasColumnName("self_assessment_tax").HasColumnType("numeric(20,2)").HasDefaultValue(0m);

        // is_recommended BOOLEAN NOT NULL DEFAULT false
        builder.Property<bool>("IsRecommended").HasColumnName("is_recommended").HasDefaultValue(false);

        // recommendation_reason TEXT nullable
        builder.Property<string?>("RecommendationReason").HasColumnName("recommendation_reason");

        builder.HasIndex("ItrReturnId").HasDatabaseName("idx_tax_computation_return_id");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
