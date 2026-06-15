using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Assessee"/>.
/// P6-HANDOFF-19: pan_cipher is TEXT (AES-256-CBC ciphertext), never plaintext.
/// </summary>
public sealed class AssesseeConfiguration : IEntityTypeConfiguration<Assessee>
{
    public void Configure(EntityTypeBuilder<Assessee> builder)
    {
        builder.ToTable("assessee_profiles");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.UserId).IsRequired().HasMaxLength(128);
        builder.Property(a => a.PanCipher).IsRequired().HasMaxLength(500).HasColumnName("pan");
        builder.Property(a => a.PanLast4).IsRequired().HasMaxLength(4).HasColumnName("pan_last4");
        builder.Property(a => a.FullName).IsRequired().HasMaxLength(200);
        builder.Property(a => a.AssesseeType).IsRequired().HasMaxLength(50).HasDefaultValue("INDIVIDUAL");
        builder.Property(a => a.Email).HasMaxLength(200);
        builder.Property(a => a.PhoneNumber).HasMaxLength(20);
        builder.Property(a => a.AadhaarLast4).HasMaxLength(4);
        builder.Property(a => a.Address).HasMaxLength(1000);
        builder.Property(a => a.AnnualTurnoverCr).HasColumnType("numeric(18,2)");

        // SWEEP-FIX WEB-04 update: itr.assessee_profiles NOW HAS organization_id UUID (nullable).
        // Column confirmed present in DB (verified 2026-06-11 via psql \d itr.assessee_profiles).
        // Map it directly — remove the previous Ignore().
        builder.Property(a => a.OrganizationId)
            .HasColumnName("organization_id");

        builder.HasIndex(a => a.UserId);
    }
}
