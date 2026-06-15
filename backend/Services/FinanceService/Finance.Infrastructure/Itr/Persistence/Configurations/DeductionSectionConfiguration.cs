using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="DeductionSection"/>.
///
/// Column alignment against live itr.deduction_sections (migration 073 + 072):
///   section       ← SectionCode  (convention → section_code, WRONG → explicit)
///   ay            ← AssessmentYear (convention → assessment_year, WRONG → explicit)
///   regime        ← Regime (convention → regime, correct)
///   description   ← Description (convention → description, correct)
///   max_amount    ← MaxLimit (convention → max_limit, WRONG → explicit)
///   is_available  ← IsAvailable (convention → is_available, correct)
///   act_version   ← ActVersion (explicit)
///   tax_year      ← TaxYear (explicit)
/// </summary>
public sealed class DeductionSectionConfiguration : IEntityTypeConfiguration<DeductionSection>
{
    public void Configure(EntityTypeBuilder<DeductionSection> builder)
    {
        builder.ToTable("deduction_sections");
        builder.HasKey(d => d.Id);

        // Live column: section (NOT section_code — convention produces section_code which doesn't exist)
        builder.Property(d => d.SectionCode).IsRequired().HasColumnName("section");

        // Live column: regime (text NOT NULL, check: OLD|NEW|BOTH)
        builder.Property(d => d.Regime).IsRequired().HasColumnName("regime");

        // Live column: description (text, nullable)
        builder.Property(d => d.Description).HasColumnName("description");

        // Live column: max_amount (NOT max_limit — convention produces max_limit which doesn't exist)
        builder.Property(d => d.MaxLimit).HasColumnType("numeric(20,2)").HasColumnName("max_amount");

        // Live column: ay (NOT assessment_year)
        builder.Property(d => d.AssessmentYear).IsRequired().HasColumnName("ay");

        // Live column: is_available (convention matches is_available — explicit for clarity)
        builder.Property(d => d.IsAvailable).IsRequired().HasDefaultValue(true).HasColumnName("is_available");

        // Migration 072 — IT Act 2025 dimension (GAP-102)
        builder.Property(d => d.ActVersion)
            .HasColumnName("act_version")
            .HasMaxLength(20)
            .HasDefaultValue("IT_ACT_1961")
            .IsRequired();
        builder.Property(d => d.TaxYear)
            .HasColumnName("tax_year")
            .HasMaxLength(10);

        // Unique constraint mirrors DB: uq_deduction_sections_section_ay_regime
        builder.HasIndex(d => new { d.SectionCode, d.AssessmentYear, d.Regime })
            .IsUnique()
            .HasDatabaseName("uq_deduction_sections_section_ay_regime");

        // Composite resolution index with act_version (migration 072)
        builder.HasIndex(d => new { d.AssessmentYear, d.ActVersion })
            .HasDatabaseName("idx_deduction_sections_ay_act");
    }
}
