using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="KeyFactsStatement"/> → <c>loan.key_facts_statement</c>.
///
/// Rows are immutable once created (no UPDATE path in the application layer).
/// The HMAC signature in <c>hmac_signature</c> can be verified independently
/// to detect tampering.
/// </summary>
public class KeyFactsStatementConfiguration : IEntityTypeConfiguration<KeyFactsStatement>
{
    public void Configure(EntityTypeBuilder<KeyFactsStatement> builder)
    {
        builder.ToTable("key_facts_statement");

        builder.HasKey(k => k.Id);
        builder.Property(k => k.Id).HasColumnName("id");
        builder.Property(k => k.ApplicationId).HasColumnName("application_id");
        builder.Property(k => k.AnnualPercentageRate).HasColumnName("annual_percentage_rate")
            .HasPrecision(10, 4);
        builder.Property(k => k.LoanAmount).HasColumnName("loan_amount").HasPrecision(18, 2);
        builder.Property(k => k.TenureMonths).HasColumnName("tenure_months");
        builder.Property(k => k.MonthlyEmi).HasColumnName("monthly_emi").HasPrecision(18, 2);
        builder.Property(k => k.FeesJson).HasColumnName("fees_json").HasColumnType("jsonb");
        builder.Property(k => k.RepaymentScheduleJson).HasColumnName("repayment_schedule_json").HasColumnType("jsonb");
        builder.Property(k => k.LenderName).HasColumnName("lender_name").HasMaxLength(200);
        builder.Property(k => k.GrievanceOfficerContact).HasColumnName("grievance_officer_contact").HasMaxLength(1000);
        builder.Property(k => k.CoolingOffDays).HasColumnName("cooling_off_days");
        builder.Property(k => k.HmacSignature).HasColumnName("hmac_signature").HasMaxLength(500);
        builder.Property(k => k.GeneratedAt).HasColumnName("generated_at");
        builder.Property(k => k.AcknowledgedAt).HasColumnName("acknowledged_at");
        // NEW-D10: locale column added by migration 079. VARCHAR(10) NOT NULL DEFAULT 'en'.
        builder.Property(k => k.Locale).HasColumnName("locale").HasMaxLength(10).HasDefaultValue("en");

        // DG-LOAN-05: extended RBI KFS disclosure fields (migration 103)
        builder.Property(k => k.NominalInterestRate)
            .HasColumnName("nominal_interest_rate").HasPrecision(10, 4);
        builder.Property(k => k.InterestType)
            .HasColumnName("interest_type").HasMaxLength(30);
        builder.Property(k => k.TotalFees)
            .HasColumnName("total_fees").HasPrecision(18, 2);
        builder.Property(k => k.NetDisbursalAmount)
            .HasColumnName("net_disbursal_amount").HasPrecision(18, 2);
        builder.Property(k => k.TotalAmountPayable)
            .HasColumnName("total_amount_payable").HasPrecision(18, 2);
        builder.Property(k => k.CoolingOffTerms)
            .HasColumnName("cooling_off_terms");
        builder.Property(k => k.GrievanceOfficerJson)
            .HasColumnName("grievance_officer_json").HasColumnType("jsonb");

        builder.Property(k => k.CreatedAt).HasColumnName("created_at");
        builder.Property(k => k.UpdatedAt).HasColumnName("updated_at");
        builder.Property(k => k.DeletedAt).HasColumnName("deleted_at");
        builder.Property(k => k.CreatedBy).HasColumnName("created_by");
        builder.Property(k => k.UpdatedBy).HasColumnName("updated_by");

        // FK relationship: many KFS per application (versioning allowed), not enforced via navigation
        builder.HasIndex(k => k.ApplicationId).HasDatabaseName("ix_key_facts_statement_application_id");

        builder.Ignore(k => k.DomainEvents);
    }
}
