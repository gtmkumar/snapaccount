using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

public sealed class ConsentCatalogEntryConfiguration : IEntityTypeConfiguration<ConsentCatalogEntry>
{
    public void Configure(EntityTypeBuilder<ConsentCatalogEntry> builder)
    {
        builder.ToTable("consent_catalog");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ConsentType).IsRequired().HasMaxLength(60);
        builder.Property(e => e.TextVersion).IsRequired().HasMaxLength(20);
        builder.Property(e => e.Locale).IsRequired().HasMaxLength(10).HasDefaultValue("en");
        builder.Property(e => e.BodyMd).IsRequired();
        builder.Property(e => e.EffectiveFrom).IsRequired();
        builder.HasIndex(e => new { e.ConsentType, e.TextVersion, e.Locale }).IsUnique();
        builder.HasIndex(e => new { e.ConsentType, e.Locale }).HasFilter("retired_at IS NULL");
    }
}
