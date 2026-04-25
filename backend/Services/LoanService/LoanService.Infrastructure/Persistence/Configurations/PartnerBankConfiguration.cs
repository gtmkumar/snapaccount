using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for PartnerBank → loan.partner_banks table.</summary>
public sealed class PartnerBankConfiguration : IEntityTypeConfiguration<PartnerBank>
{
    public void Configure(EntityTypeBuilder<PartnerBank> builder)
    {
        builder.ToTable("partner_banks");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.LogoUrl).HasMaxLength(500);
        builder.Property(x => x.AdapterType)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(x => x.ContactEmail).HasMaxLength(200);
        // P6-HANDOFF-27: AES-GCM encrypted config stored as bytea
        builder.Property(x => x.ApiConfigEncrypted).HasColumnType("bytea");
        builder.Property(x => x.ApiConfigKeyRef).HasMaxLength(200);
        builder.Property(x => x.WebhookSecretRef).HasMaxLength(200);

        builder.HasIndex(x => x.Name).IsUnique();
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
