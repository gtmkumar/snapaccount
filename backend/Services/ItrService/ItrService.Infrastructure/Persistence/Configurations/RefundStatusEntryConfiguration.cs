using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="RefundStatusEntry"/> → itr.refund_status_log.
/// SWEEP-FIX: aligned all property/column mappings to the actual DB schema.
/// DB columns verified via psql \d itr.refund_status_log (2026-06-11).
/// </summary>
public sealed class RefundStatusEntryConfiguration : IEntityTypeConfiguration<RefundStatusEntry>
{
    public void Configure(EntityTypeBuilder<RefundStatusEntry> builder)
    {
        builder.ToTable("refund_status_log");
        builder.HasKey(r => r.Id);

        // filing_id — required FK
        builder.Property(r => r.FilingId)
            .HasColumnName("filing_id")
            .IsRequired();

        // DB column: user_id NOT NULL — maps to AssesseeId in domain model
        builder.Property(r => r.AssesseeId)
            .HasColumnName("user_id")
            .IsRequired();

        // DB column: status VARCHAR(40) — maps to RefundStatus
        builder.Property(r => r.RefundStatus)
            .HasColumnName("status")
            .HasMaxLength(40)
            .IsRequired()
            .HasDefaultValue("NOT_DETERMINED");

        // DB column: amount NUMERIC(20,2) nullable — maps to RefundAmount
        builder.Property(r => r.RefundAmount)
            .HasColumnName("amount")
            .HasColumnType("numeric(20,2)");

        // DB column: bank_account_masked VARCHAR(40) nullable — maps to BankAccount
        builder.Property(r => r.BankAccount)
            .HasColumnName("bank_account_masked")
            .HasMaxLength(40);

        // DB column: reference_no VARCHAR(120) nullable — maps to TransactionReference
        builder.Property(r => r.TransactionReference)
            .HasColumnName("reference_no")
            .HasMaxLength(120);

        // DB column: failure_reason TEXT nullable — maps to StatusMessage
        builder.Property(r => r.StatusMessage)
            .HasColumnName("failure_reason");

        // DB column: source VARCHAR(40) NOT NULL — maps to LastPolledAt conceptually as "who updated".
        // Source has no entity property — shadow property with default MANUAL.
        builder.Property<string>("Source")
            .HasColumnName("source")
            .HasMaxLength(40)
            .IsRequired()
            .HasDefaultValue("POLL_API");

        // DB has status_date DATE NOT NULL — shadow property (no entity prop maps to it).
        builder.Property<DateOnly>("StatusDate")
            .HasColumnName("status_date")
            .IsRequired()
            .HasDefaultValueSql("CURRENT_DATE");

        // raw_payload_jsonb JSONB nullable — shadow property.
        builder.Property<string?>("RawPayloadJsonb")
            .HasColumnName("raw_payload_jsonb")
            .HasColumnType("jsonb");

        // Entity has LastPolledAt — no matching DB column. Ignore it; LastPolledAt is runtime-only.
        // DDL HANDOFF (db-engineer): consider adding last_polled_at TIMESTAMPTZ to refund_status_log.
        builder.Ignore(r => r.LastPolledAt);

        // RefundDate (DateOnly?) — no matching DB column (status_date is the date, not refund date).
        // DDL HANDOFF (db-engineer): consider adding refund_date DATE to refund_status_log.
        builder.Ignore(r => r.RefundDate);

        builder.HasIndex(r => r.FilingId).HasDatabaseName("idx_refund_status_log_filing_id");
        builder.HasIndex(r => r.AssesseeId).HasDatabaseName("idx_refund_status_log_user_id");
        builder.HasQueryFilter(r => r.DeletedAt == null);
    }
}
