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

        // No soft-delete filter on consents (DB trigger blocks hard-delete; 7-year retention)
    }
}
