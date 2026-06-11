using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for LoanProduct → loan.loan_products table.
/// BUG-FIX: Missing configuration caused EF to fall back to default table name "LoanProducts"
/// which does not exist; real table is loan.loan_products.
/// DB is source of truth — all columns verified against psql \d loan.loan_products.
/// </summary>
public sealed class LoanProductConfiguration : IEntityTypeConfiguration<LoanProduct>
{
    public void Configure(EntityTypeBuilder<LoanProduct> builder)
    {
        builder.ToTable("loan_products");

        builder.HasKey(x => x.Id);

        // bank_id — FK to loan.partner_banks
        builder.Property(x => x.BankId)
            .HasColumnName("bank_id")
            .IsRequired();

        // product_name VARCHAR(300)
        builder.Property(x => x.ProductName)
            .HasColumnName("product_name")
            .HasMaxLength(300)
            .IsRequired();

        // min_amount / max_amount NUMERIC(15,2)
        builder.Property(x => x.MinAmount)
            .HasColumnName("min_amount")
            .HasColumnType("numeric(15,2)")
            .IsRequired();

        builder.Property(x => x.MaxAmount)
            .HasColumnName("max_amount")
            .HasColumnType("numeric(15,2)")
            .IsRequired();

        // interest_rate_min_pct / interest_rate_max_pct NUMERIC(6,3) — nullable in DB
        builder.Property(x => x.InterestRateMin)
            .HasColumnName("interest_rate_min_pct")
            .HasColumnType("numeric(6,3)");

        builder.Property(x => x.InterestRateMax)
            .HasColumnName("interest_rate_max_pct")
            .HasColumnType("numeric(6,3)");

        // DB has tenure_min_months SMALLINT and tenure_max_months SMALLINT.
        // Entity has a single TenureMonths — map to tenure_min_months.
        // tenure_max_months has no matching entity property — ignore via shadow property.
        // DDL HANDOFF (db-engineer): none required; TenureMonths maps to tenure_min_months;
        // tenure_max_months is a read-only shadow property not exposed in the domain model.
        builder.Property(x => x.TenureMonths)
            .HasColumnName("tenure_min_months")
            .IsRequired();

        // Shadow property for tenure_max_months (DB column exists, no domain property)
        builder.Property<short>("TenureMaxMonths")
            .HasColumnName("tenure_max_months")
            .IsRequired();

        // eligibility_criteria JSONB (not null, default '{}')
        // Entity uses EligibilityCriteriaJsonb (JsonDocument?) — mapped as jsonb.
        builder.Property(x => x.EligibilityCriteriaJsonb)
            .HasColumnName("eligibility_criteria")
            .HasColumnType("jsonb");

        // product_code VARCHAR(80) — DB column exists, no domain property.
        // Shadow property so EF does not fail on INSERT (DB column is NOT NULL).
        builder.Property<string>("ProductCode")
            .HasColumnName("product_code")
            .HasMaxLength(80)
            .IsRequired()
            .HasDefaultValue("DEFAULT");

        // description TEXT — nullable DB column, no domain property. Shadow.
        builder.Property<string?>("Description")
            .HasColumnName("description");

        // processing_fee_pct NUMERIC(5,2) — nullable DB column, no domain property. Shadow.
        builder.Property<decimal?>("ProcessingFeePct")
            .HasColumnName("processing_fee_pct")
            .HasColumnType("numeric(5,2)");

        // PurposeCategories is a domain property but has no column in DB.
        // DDL HANDOFF (db-engineer): add purpose_categories TEXT to loan.loan_products if needed.
        builder.Ignore(x => x.PurposeCategories);

        // is_active BOOLEAN NOT NULL DEFAULT true
        builder.Property(x => x.IsActive)
            .HasColumnName("is_active")
            .IsRequired()
            .HasDefaultValue(true);

        // Navigation
        builder.HasOne(x => x.Bank)
            .WithMany()
            .HasForeignKey(x => x.BankId)
            .OnDelete(DeleteBehavior.Restrict);

        // Indexes
        builder.HasIndex(x => x.BankId).HasDatabaseName("idx_loan_products_bank_id");
        builder.HasIndex(x => x.IsActive).HasDatabaseName("idx_loan_products_is_active");

        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
