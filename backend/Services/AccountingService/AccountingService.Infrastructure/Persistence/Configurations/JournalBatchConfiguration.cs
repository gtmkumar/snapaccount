using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for <see cref="JournalBatch"/>.</summary>
public sealed class JournalBatchConfiguration : IEntityTypeConfiguration<JournalBatch>
{
    public void Configure(EntityTypeBuilder<JournalBatch> builder)
    {
        builder.ToTable("journal_batches");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.OrgId).IsRequired();
        builder.Property(e => e.BatchNumber).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(500).IsRequired();
        builder.Property(e => e.PostingDate).IsRequired();
        builder.Property(e => e.FyYear).IsRequired();
        builder.Property(e => e.TotalDebit).HasColumnType("numeric(18,2)");
        builder.Property(e => e.TotalCredit).HasColumnType("numeric(18,2)");
        builder.Property(e => e.Source).HasConversion<string>().HasMaxLength(20);
        builder.Property(e => e.Status).HasMaxLength(20).IsRequired();

        builder.Ignore(e => e.Entries); // navigation populated via LedgerEntry.JournalBatchId

        builder.HasIndex(e => e.OrgId);
        builder.HasIndex(e => new { e.OrgId, e.BatchNumber }).IsUnique();
    }
}
