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

        // DG-ITR-04: dedicated ca_notes column (distinct from rejection reason). Added migration 097.
        builder.Property(f => f.CaNotes).HasColumnName("ca_notes");

        // DG-ITR-05: user_id NOT NULL (024_itr_assessee_filings.sql:79). EF must write it.
        builder.Property(f => f.UserId).IsRequired().HasColumnName("user_id");

        // DG-ITR-08: Income-head columns added by migration 066. Remove the stale Ignore() calls.
        // Columns: computation_hash, salary_income, house_property_income, business_income,
        //          capital_gains, other_income (all NUMERIC(20,2)).
        builder.Property(f => f.ComputationHash).HasMaxLength(64).HasColumnName("computation_hash");
        builder.Property(f => f.SalaryIncome).HasColumnType("numeric(20,2)").HasColumnName("salary_income");
        builder.Property(f => f.HousePropertyIncome).HasColumnType("numeric(20,2)").HasColumnName("house_property_income");
        builder.Property(f => f.BusinessIncome).HasColumnType("numeric(20,2)").HasColumnName("business_income");
        builder.Property(f => f.CapitalGains).HasColumnType("numeric(20,2)").HasColumnName("capital_gains");
        builder.Property(f => f.OtherIncome).HasColumnType("numeric(20,2)").HasColumnName("other_income");

        // Shadow properties for DB-only fields not on the entity
        builder.Property<Guid?>("TaxSlabVersionId").HasColumnName("tax_slab_version_id");
        // BUG-ITR-ASSESSEE-MAPPING (related filing write-path divergence): gross_total_income is
        // NOT NULL DEFAULT 0 (migration 024). The old shadow property was never set, so EF sent an
        // explicit NULL and 23502'd on every filing insert. It is vestigial — the computation is
        // persisted in computation_jsonb — so drop it and let the DB default (0) apply.

        builder.HasIndex(f => f.AssesseeId);
        builder.HasIndex(f => new { f.AssesseeId, f.AssessmentYear }).IsUnique();
    }
}
