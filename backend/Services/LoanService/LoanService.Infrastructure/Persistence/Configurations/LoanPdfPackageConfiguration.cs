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
        builder.Property(x => x.GcsUri).HasMaxLength(500).IsRequired().HasColumnName("gcs_uri");
        builder.Property(x => x.PagesCount).IsRequired().HasColumnName("pages_count");
        // P6-HANDOFF-28: sha256_hash 32 bytes (DB CHECK enforces this)
        builder.Property(x => x.Sha256Hash).HasColumnType("bytea").IsRequired().HasColumnName("sha256_hash");
        builder.Property(x => x.GeneratedAt).IsRequired().HasColumnName("generated_at");
        builder.Property(x => x.WatermarkText).HasMaxLength(500).HasColumnName("watermark_text");

        // SWEEP-FIX: IsCurrent has no column in loan.pdf_packages — ignore to prevent SQL errors.
        // DDL HANDOFF (db-engineer): add is_current BOOLEAN NOT NULL DEFAULT TRUE to loan.pdf_packages
        builder.Ignore(x => x.IsCurrent);

        // DB also has gcs_object_key, size_bytes, generated_by, is_submitted_to_bank, etc. — shadow props
        builder.Property<string?>("GcsObjectKey").HasColumnName("gcs_object_key");
        builder.Property<bool>("IsSubmittedToBank").HasColumnName("is_submitted_to_bank").HasDefaultValue(false);

        builder.HasIndex(x => x.ApplicationId);
    }
}
