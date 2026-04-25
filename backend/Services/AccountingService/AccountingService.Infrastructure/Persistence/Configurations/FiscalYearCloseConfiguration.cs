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
        builder.Property(e => e.OrgId).IsRequired();
        builder.Property(e => e.FyYear).IsRequired();
        builder.Property(e => e.Status).HasMaxLength(30).IsRequired();
        builder.Property(e => e.ClosedBy);
        builder.Property(e => e.ClosedAt);
        builder.Property(e => e.Notes).HasMaxLength(2000);

        builder.HasIndex(e => new { e.OrgId, e.FyYear }).IsUnique();
    }
}
