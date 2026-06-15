using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Filing"/>.
/// P6-HANDOFF-18: tax_slab_version_id + computation_jsonb are immutable once set.
/// P6-HANDOFF-20: itr_v_uri is NEVER persisted — only itr_v_object_key is stored.
/// </summary>
public sealed class FilingConfiguration : IEntityTypeConfiguration<Filing>
{
    public void Configure(EntityTypeBuilder<Filing> builder)
    {
        builder.ToTable("filings");
        builder.HasKey(f => f.Id);

        // SWEEP-FIX: AssesseeId → assessee_profile_id (column name differs in DB)
        builder.Property(f => f.AssesseeId).IsRequired().HasColumnName("assessee_profile_id");

        // SWEEP-FIX: AssessmentYear → ay (column name differs in DB)
        builder.Property(f => f.AssessmentYear).IsRequired().HasMaxLength(20).HasColumnName("ay");

        // SWEEP-FIX: ItrFormType → itr_form (column name differs in DB)
        builder.Property(f => f.ItrFormType).IsRequired().HasMaxLength(10).HasDefaultValue("ITR-1").HasColumnName("itr_form");

        // SWEEP-FIX: Regime → regime_chosen (column name differs in DB)
        builder.Property(f => f.Regime).IsRequired().HasMaxLength(5).HasDefaultValue("NEW").HasColumnName("regime_chosen");

        builder.Property(f => f.Status).IsRequired().HasMaxLength(50).HasDefaultValue("DRAFT");
        builder.Property(f => f.ComputationJsonb).HasColumnType("jsonb").HasColumnName("computation_jsonb");
        builder.Property(f => f.TotalDeductions).HasColumnType("numeric(18,2)").HasColumnName("total_deductions");

        // SWEEP-FIX: ItrVObjectKey → itr_v_object_key (matches via convention, explicit for safety)
        builder.Property(f => f.ItrVObjectKey).HasMaxLength(500).HasColumnName("itr_v_object_key");

        // SWEEP-FIX: AcknowledgementNumber → ack_number (column name differs in DB)
        builder.Property(f => f.AcknowledgementNumber).HasMaxLength(100).HasColumnName("ack_number");

        // SWEEP-FIX: CaRejectionReason → ca_review_notes (column name differs in DB)
        builder.Property(f => f.CaRejectionReason).HasMaxLength(2000).HasColumnName("ca_review_notes");

        // SWEEP-FIX: ComputationHash, SalaryIncome, HousePropertyIncome, BusinessIncome,
        //            CapitalGains, OtherIncome have NO columns in itr.filings.
        // DB uses gross_total_income, total_income, total_tax, tax_paid, refund_due, payable instead.
        // DDL HANDOFF (db-engineer): add the following to itr.filings if granular income breakdowns needed:
        //   computation_hash VARCHAR(64)
        //   salary_income NUMERIC(18,2)
        //   house_property_income NUMERIC(18,2)
        //   business_income NUMERIC(18,2)
        //   capital_gains NUMERIC(18,2)
        //   other_income NUMERIC(18,2)
        builder.Ignore(f => f.ComputationHash);
        builder.Ignore(f => f.SalaryIncome);
        builder.Ignore(f => f.HousePropertyIncome);
        builder.Ignore(f => f.BusinessIncome);
        builder.Ignore(f => f.CapitalGains);
        builder.Ignore(f => f.OtherIncome);

        // DB also has tax_slab_version_id, gross_total_income, total_tax, etc. — shadow properties
        builder.Property<Guid?>("TaxSlabVersionId").HasColumnName("tax_slab_version_id");
        builder.Property<decimal?>("GrossTotalIncome").HasColumnName("gross_total_income").HasColumnType("numeric(18,2)");

        builder.HasIndex(f => f.AssesseeId);
        builder.HasIndex(f => new { f.AssesseeId, f.AssessmentYear }).IsUnique();
    }
}
