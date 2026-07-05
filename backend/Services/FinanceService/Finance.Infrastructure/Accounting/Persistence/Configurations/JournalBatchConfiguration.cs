using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for <see cref="JournalBatch"/>.</summary>
public sealed class JournalBatchConfiguration : IEntityTypeConfiguration<JournalBatch>
{
    public void Configure(EntityTypeBuilder<JournalBatch> builder)
    {
        // SWEEP-FIX WEB-14: accounting.journal_batches does NOT exist in the DB.
        // The closest equivalent is accounting.journal_entry (same purpose: grouping double-entry lines).
        // Column mapping:
        //   OrgId → organization_id
        //   BatchNumber → entry_number (VARCHAR 50)
        //   Description → description (text)
        //   PostingDate (DateOnly) → entry_date (date)
        //   FyYear → no direct column; stored as shadow property with EF-only visibility
        //   TotalDebit → total_debit  (numeric(20,2))
        //   TotalCredit → total_credit (numeric(20,2))
        //   Source → entry_type (VARCHAR 50) — mapped via converter
        //   Status → status (VARCHAR 50)
        // DDL HANDOFF (db-engineer): accounting.journal_entry is the canonical batch table.
        // Consider aliasing or adding BatchNumber as a VIEW column if distinction is needed later.
        builder.ToTable("journal_entry");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.OrgId).IsRequired().HasColumnName("organization_id");
        builder.Property(e => e.BatchNumber).HasMaxLength(50).IsRequired().HasColumnName("entry_number");
        builder.Property(e => e.Description).HasMaxLength(500).IsRequired().HasColumnName("description");
        builder.Property(e => e.PostingDate).IsRequired().HasColumnName("entry_date");
        builder.Property(e => e.TotalDebit).HasColumnType("numeric(20,2)").HasColumnName("total_debit");
        builder.Property(e => e.TotalCredit).HasColumnType("numeric(20,2)").HasColumnName("total_credit");

        // Source (PostingSource enum) → entry_type VARCHAR(50)
        builder.Property(e => e.Source).HasConversion<string>().HasMaxLength(50).HasColumnName("entry_type");

        builder.Property(e => e.Status).HasMaxLength(50).IsRequired().HasColumnName("status");

        // FyYear has no direct column in journal_entry; ignore it to prevent SQL errors.
        // DDL HANDOFF (db-engineer): add fy_year SMALLINT NOT NULL DEFAULT 0 to accounting.journal_entry
        //   so batch fiscal year grouping can be queried without full scan.
        builder.Ignore(e => e.FyYear);

        builder.Ignore(e => e.Entries); // navigation populated via LedgerEntry

        builder.HasIndex(e => e.OrgId).HasDatabaseName("idx_journal_entry_org_id");
        builder.HasIndex(e => new { e.OrgId, e.BatchNumber }).IsUnique();
    }
}
