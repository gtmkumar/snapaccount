using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="FiscalYearClose"/>.
/// Maps to EXISTING <c>accounting.financial_year_close</c> table (migration 003).
/// P6-HANDOFF-01: do NOT create a parallel table.
/// </summary>
public sealed class FiscalYearCloseConfiguration : IEntityTypeConfiguration<FiscalYearClose>
{
    public void Configure(EntityTypeBuilder<FiscalYearClose> builder)
    {
        // P6-HANDOFF-01: maps to the existing table from migration 003
        builder.ToTable("financial_year_close");

        builder.HasKey(e => e.Id);

        // SWEEP-FIX: OrgId → organization_id
        builder.Property(e => e.OrgId).IsRequired().HasColumnName("organization_id");

        // SWEEP-FIX: FyYear (int) → financial_year (VARCHAR 10, e.g. "2025-26")
        // Store as string via converter to match DB VARCHAR(10) column type.
        // Note: expression tree cannot use range [..4] or out-var TryParse — use static method.
        builder.Property(e => e.FyYear)
            .IsRequired()
            .HasColumnName("financial_year")
            .HasMaxLength(10)
            .HasConversion(
                v => $"{v - 1}-{v % 100:D2}",           // 2026 → "2025-26"
                s => ParseFyYear(s));                    // "2025-26" → 2026

        builder.Property(e => e.Status).HasMaxLength(50).IsRequired().HasColumnName("status");

        // SWEEP-FIX: ClosedBy → initiated_by; ClosedAt → completed_at; Notes → closing_notes
        builder.Property(e => e.ClosedBy).HasColumnName("initiated_by");
        builder.Property(e => e.ClosedAt).HasColumnName("completed_at");
        builder.Property(e => e.Notes).HasMaxLength(2000).HasColumnName("closing_notes");

        // DB also has retained_earnings numeric(20,2) — shadow property (entity doesn't expose it)
        builder.Property<decimal?>("RetainedEarnings")
            .HasColumnName("retained_earnings")
            .HasColumnType("numeric(20,2)");

        builder.HasIndex(e => new { e.OrgId, e.FyYear }).IsUnique();
    }

    /// <summary>
    /// Converts a financial_year string (e.g. "2025-26") to an int FY year (2026).
    /// Static method required because expression trees cannot contain range indexers or out-var TryParse.
    /// </summary>
    private static int ParseFyYear(string s)
    {
        if (s is null || s.Length < 4) return 0;
        // "2025-26" → take first 4 chars "2025", parse to 2025, add 1 → 2026
        if (int.TryParse(s.Substring(0, 4), out var startYear))
            return startYear + 1;
        return 0;
    }
}
