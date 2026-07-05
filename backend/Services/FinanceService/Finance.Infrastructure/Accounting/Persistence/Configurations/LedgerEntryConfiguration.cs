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
        // BUG-ACCT-COA-TEMPLATE-CODE (related write-path divergence): ledger_entries.source CHECK is
        // ('OCR','MANUAL','IMPORT','SYSTEM') and status CHECK is
        // ('PENDING_REVIEW','POSTED','REVERSED','REJECTED'). The enum member names under
        // .HasConversion<string>() ("Ocr"/"PendingReview"/…) don't match, so every posting 23514'd.
        builder.Property(e => e.Source).HasMaxLength(20).IsRequired()
            .HasConversion(v => SourceToDb(v), v => SourceFromDb(v));
        builder.Property(e => e.Status).HasMaxLength(30).IsRequired()
            .HasConversion(v => StatusToDb(v), v => StatusFromDb(v));
        builder.Property(e => e.PostedAt).IsRequired();
        // BUG-ACCT-COA-TEMPLATE-CODE (related write-path divergence): entry_date DATE NOT NULL (no default).
        builder.Property(e => e.EntryDate).HasColumnName("entry_date").IsRequired();
        // SWEEP-FIX: ReviewedBy → reviewer_user_id (convention would generate reviewed_by)
        builder.Property(e => e.ReviewedBy).HasColumnName("reviewer_user_id");
        builder.Property(e => e.ReviewedAt).HasColumnName("reviewed_at");
        builder.Property(e => e.DedupeHash).HasMaxLength(64); // SHA-256 hex
        // SWEEP-FIX WEB-14 (CORRECTED): JournalBatchId → journal_entry_id
        // The DB uses journal_entry_id (FK to accounting.journal_entry) as the batch grouping column.
        // Since JournalBatch is now mapped to journal_entry, JournalBatchId maps cleanly here.
        builder.Property(e => e.JournalBatchId).HasColumnName("journal_entry_id");
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

    // Static so converter lambdas stay method-call expressions (no switch expressions in trees).
    private static string SourceToDb(PostingSource v) => v switch
    {
        PostingSource.Ocr => "OCR",
        PostingSource.Manual => "MANUAL",
        PostingSource.Import => "IMPORT",
        PostingSource.System => "SYSTEM",
        _ => "MANUAL"
    };

    private static PostingSource SourceFromDb(string v) => v switch
    {
        "OCR" => PostingSource.Ocr,
        "MANUAL" => PostingSource.Manual,
        "IMPORT" => PostingSource.Import,
        "SYSTEM" => PostingSource.System,
        _ => PostingSource.Manual
    };

    private static string StatusToDb(PostingStatus v) => v switch
    {
        PostingStatus.PendingReview => "PENDING_REVIEW",
        PostingStatus.Approved => "POSTED",
        PostingStatus.Reversed => "REVERSED",
        _ => "PENDING_REVIEW"
    };

    private static PostingStatus StatusFromDb(string v) => v switch
    {
        "PENDING_REVIEW" => PostingStatus.PendingReview,
        "POSTED" => PostingStatus.Approved,
        "REVERSED" => PostingStatus.Reversed,
        "REJECTED" => PostingStatus.Reversed,
        _ => PostingStatus.PendingReview
    };
}
