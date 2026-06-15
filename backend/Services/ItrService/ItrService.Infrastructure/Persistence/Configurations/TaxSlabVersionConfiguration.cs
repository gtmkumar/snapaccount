using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="TaxSlabVersion"/>.</summary>
public sealed class TaxSlabVersionConfiguration : IEntityTypeConfiguration<TaxSlabVersion>
{
    public void Configure(EntityTypeBuilder<TaxSlabVersion> builder)
    {
        builder.ToTable("tax_slab_versions");
        builder.HasKey(t => t.Id);

        // Live column: ay (NOT assessment_year — snake_case convention would produce wrong name)
        builder.Property(t => t.AssessmentYear).IsRequired().HasMaxLength(20).HasColumnName("ay");
        builder.Property(t => t.Regime).IsRequired().HasMaxLength(5);

        // Live column: slabs_jsonb
        builder.Property(t => t.SlabsJson).IsRequired().HasColumnType("jsonb").HasColumnName("slabs_jsonb");

        // Live column: standard_deduction (convention matches — explicit for clarity)
        builder.Property(t => t.StandardDeduction).HasColumnType("numeric(18,2)").HasColumnName("standard_deduction");

        // Live column: rebate_under_87a (convention would produce rebate87_a_income_limit — wrong)
        builder.Property(t => t.Rebate87AIncomeLimit).HasColumnType("numeric(18,2)").HasColumnName("rebate_under_87a");

        // Live column: rebate_under_87a_amount (convention would produce rebate87_a_max_amount — wrong)
        builder.Property(t => t.Rebate87AMaxAmount).HasColumnType("numeric(18,2)").HasColumnName("rebate_under_87a_amount");

        // Live column: surcharge_jsonb
        builder.Property(t => t.SurchargeJson).HasColumnType("jsonb").HasColumnName("surcharge_jsonb");

        // Live column: cess_pct (convention would produce cess_rate_pct — ROOT CAUSE of 42703 error)
        builder.Property(t => t.CessRatePct).HasColumnType("numeric(5,2)").HasColumnName("cess_pct").HasDefaultValue(4m);

        // Live column: effective_from (convention matches)
        builder.Property(t => t.EffectiveFrom).HasColumnName("effective_from");

        // Live column: effective_to (convention would produce effective_until — wrong)
        builder.Property(t => t.EffectiveUntil).HasColumnName("effective_to");

        // Migration 072 — IT Act 2025 dimension (GAP-102)
        builder.Property(t => t.ActVersion)
            .HasColumnName("act_version")
            .HasMaxLength(20)
            .HasDefaultValue("IT_ACT_1961")
            .IsRequired();
        builder.Property(t => t.TaxYear)
            .HasColumnName("tax_year")
            .HasMaxLength(10);

        builder.HasIndex(t => new { t.AssessmentYear, t.Regime });
        // Composite resolution index with act_version (migration 072)
        builder.HasIndex(t => new { t.AssessmentYear, t.Regime, t.ActVersion })
            .HasDatabaseName("idx_tax_slab_versions_ay_regime_act");
    }
}
