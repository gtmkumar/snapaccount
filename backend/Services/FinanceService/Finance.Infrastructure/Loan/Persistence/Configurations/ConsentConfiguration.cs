using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for Consent → loan.consents table.</summary>
public sealed class ConsentConfiguration : IEntityTypeConfiguration<Consent>
{
    public void Configure(EntityTypeBuilder<Consent> builder)
    {
        builder.ToTable("consents");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.ApplicationId).IsRequired();
        builder.Property(x => x.ConsentType)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();
        builder.Property(x => x.ConsentTextVersion).HasMaxLength(50).IsRequired();

        // GAP-040 / P6-HANDOFF-25: locale of consent text shown (e.g. "en", "hi").
        // Migration 066: consent_locale VARCHAR(10) NOT NULL DEFAULT 'en' confirmed in DB.
        builder.Property(x => x.ConsentLocale).HasColumnName("consent_locale").HasMaxLength(10).IsRequired();
        builder.Property(x => x.SignedAt).IsRequired();
        builder.Property(x => x.IpAddress).HasMaxLength(45);
        builder.Property(x => x.UserAgent).HasMaxLength(512);
        builder.Property(x => x.AnonymizationReason).HasMaxLength(100);

        // P6-HANDOFF-26: signature_hash is 32 bytes (HMAC-SHA256)
        builder.Property(x => x.SignatureHash)
            .HasColumnType("bytea")
            .IsRequired();

        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => new { x.ApplicationId, x.ConsentType }).IsUnique();

        // No soft-delete filter on consents: loan.consents has NO deleted_at column.
        // DB trigger (trg_consents_no_delete) prevents hard deletes; 7-year retention enforced.
        // Override the global BaseDbContext soft-delete filter with always-true to prevent
        // EF from generating "WHERE c.deleted_at IS NULL" which would fail with 42703.
        builder.HasQueryFilter(c => true);
    }
}
