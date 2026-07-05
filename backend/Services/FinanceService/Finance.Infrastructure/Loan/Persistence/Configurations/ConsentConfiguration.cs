using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using System.Text.Json;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for Consent → loan.consents table.</summary>
public sealed class ConsentConfiguration : IEntityTypeConfiguration<Consent>
{
    public void Configure(EntityTypeBuilder<Consent> builder)
    {
        builder.ToTable("consents");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.ApplicationId).IsRequired();
        // BUG-LOAN-CONSENT-ENUM: consent_type is a native PG enum (loan.consent_type), mapped
        // via npgsql.MapEnum<ConsentType> in DependencyInjection. Do NOT add .HasConversion<string>()
        // here — that would send a character varying parameter and 500 (42804) against the enum column.
        builder.Property(x => x.ConsentType)
            .IsRequired();
        builder.Property(x => x.ConsentTextVersion).HasMaxLength(50).IsRequired();

        // GAP-040 / P6-HANDOFF-25: locale of consent text shown (e.g. "en", "hi").
        // Migration 066: consent_locale VARCHAR(10) NOT NULL DEFAULT 'en' confirmed in DB.
        builder.Property(x => x.ConsentLocale).HasColumnName("consent_locale").HasMaxLength(10).IsRequired();
        builder.Property(x => x.SignedAt).IsRequired();
        // BUG-LOAN-CONSENT-ENUM (related write-path divergence): loan.consents.ip_address is INET
        // (migration 027), not varchar. EF cannot map a string directly to inet, so convert the
        // string ↔ System.Net.IPAddress (which Npgsql maps to inet). Null bypasses the converter.
        builder.Property(x => x.IpAddress)
            .HasColumnType("inet")
            .HasConversion(
                s => System.Net.IPAddress.Parse(s),
                ip => ip.ToString());
        builder.Property(x => x.UserAgent).HasMaxLength(512);
        builder.Property(x => x.AnonymizationReason).HasMaxLength(100);

        // P6-HANDOFF-26: signature_hash is 32 bytes (HMAC-SHA256)
        builder.Property(x => x.SignatureHash)
            .HasColumnType("bytea")
            .IsRequired();

        // DG-LOAN-04: DPDP revocation columns (migration 103)
        builder.Property(x => x.RevokedAt).HasColumnName("revoked_at");
        builder.Property(x => x.RevocationReason).HasColumnName("revocation_reason").HasMaxLength(500);

        // DG-LOAN-06: F4.2 audit fields (migration 109)
        // device_id — masked device identifier; VARCHAR(128) to accommodate masked form.
        builder.Property(x => x.DeviceId)
            .HasColumnName("device_id")
            .HasMaxLength(128);

        // shared_with_bank_ids — JSONB array of partner-bank UUIDs for DataShareWithBank consents.
        builder.Property(x => x.SharedWithBankIds)
            .HasColumnName("shared_with_bank_ids")
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => v == null ? null : JsonSerializer.Deserialize<Guid[]>(v, (JsonSerializerOptions?)null));

        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => new { x.ApplicationId, x.ConsentType }).IsUnique();

        // No soft-delete filter on consents: loan.consents has NO deleted_at column.
        // DB trigger (trg_consents_no_delete) prevents hard deletes; 7-year retention enforced.
        // Override the global BaseDbContext soft-delete filter with always-true to prevent
        // EF from generating "WHERE c.deleted_at IS NULL" which would fail with 42703.
        builder.HasQueryFilter(c => true);
    }
}
