using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for LoanPdfPackage → loan.pdf_packages table.</summary>
public sealed class LoanPdfPackageConfiguration : IEntityTypeConfiguration<LoanPdfPackage>
{
    public void Configure(EntityTypeBuilder<LoanPdfPackage> builder)
    {
        builder.ToTable("pdf_packages");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.ApplicationId).IsRequired();
        builder.Property(x => x.GcsUri).HasMaxLength(500).IsRequired();
        builder.Property(x => x.PagesCount).IsRequired();
        // P6-HANDOFF-28: sha256_hash 32 bytes (DB CHECK enforces this)
        builder.Property(x => x.Sha256Hash).HasColumnType("bytea").IsRequired();
        builder.Property(x => x.GeneratedAt).IsRequired();
        builder.Property(x => x.WatermarkText).HasMaxLength(500);

        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => new { x.ApplicationId, x.IsCurrent });
    }
}
