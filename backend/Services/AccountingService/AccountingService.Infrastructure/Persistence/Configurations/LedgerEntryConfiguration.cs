using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="LedgerEntry"/>.
/// Maps to <c>accounting.ledger_entries</c>.
/// Configures the partial unique index on <c>dedupe_hash</c> for Pub/Sub idempotency (P6-HANDOFF-03).
/// </summary>
public sealed class LedgerEntryConfiguration : IEntityTypeConfiguration<LedgerEntry>
{
    public void Configure(EntityTypeBuilder<LedgerEntry> builder)
    {
        builder.ToTable("ledger_entries");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.OrgId).IsRequired();
        builder.Property(e => e.FyYear).IsRequired();
        builder.Property(e => e.PeriodMonth);
        builder.Property(e => e.DebitAccountId).IsRequired();
        builder.Property(e => e.CreditAccountId).IsRequired();
        builder.Property(e => e.Amount).HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(e => e.Currency).HasMaxLength(3).IsRequired().HasDefaultValue("INR");
        builder.Property(e => e.Narration).HasMaxLength(1000).IsRequired();
        builder.Property(e => e.Source).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(e => e.Status).HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.Property(e => e.PostedAt).IsRequired();
        builder.Property(e => e.ReviewedBy);
        builder.Property(e => e.ReviewedAt);
        builder.Property(e => e.DedupeHash).HasMaxLength(64); // SHA-256 hex
        builder.Property(e => e.JournalBatchId);
        builder.Property(e => e.DocumentId);

        // Indexes for performance (org_id, fy_year, period_month) and (document_id)
        builder.HasIndex(e => new { e.OrgId, e.FyYear, e.PeriodMonth });
        builder.HasIndex(e => e.DocumentId);
        builder.HasIndex(e => e.PostedAt);

        // Partial unique index for Pub/Sub idempotency (WHERE dedupe_hash IS NOT NULL)
        // Cannot be expressed via HasFilter in all EF versions; migrated as raw SQL in the additive migration.
        // We declare a regular unique index here; the partial filter is applied via migration SQL (016).
        builder.HasIndex(e => e.DedupeHash)
            .HasFilter("dedupe_hash IS NOT NULL")
            .IsUnique();
    }
}
