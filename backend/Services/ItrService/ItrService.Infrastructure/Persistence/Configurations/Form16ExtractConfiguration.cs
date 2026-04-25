using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Form16Extract"/>.
/// P6-HANDOFF-19: employee_pan_cipher is ciphertext TEXT.
/// P6-HANDOFF-21: parsed_json is jsonb — DPDP cascade must null on erasure.
/// </summary>
public sealed class Form16ExtractConfiguration : IEntityTypeConfiguration<Form16Extract>
{
    public void Configure(EntityTypeBuilder<Form16Extract> builder)
    {
        builder.ToTable("form_16_extracts");
        builder.HasKey(f => f.Id);
        builder.Property(f => f.FilingId).IsRequired();
        builder.Property(f => f.AssesseeId).IsRequired();
        builder.Property(f => f.GcsUri).IsRequired().HasMaxLength(500);
        builder.Property(f => f.EmployeePanCipher).IsRequired().HasMaxLength(500).HasColumnName("employee_pan_cipher");
        builder.Property(f => f.EmployeePanLast4).IsRequired().HasMaxLength(4).HasColumnName("employee_pan_last4");
        builder.Property(f => f.EmployerTan).HasMaxLength(20);
        builder.Property(f => f.EmployerPan).HasMaxLength(15);
        builder.Property(f => f.EmployerName).HasMaxLength(200);
        builder.Property(f => f.GrossSalary).HasColumnType("numeric(18,2)");
        builder.Property(f => f.TdsDeducted).HasColumnType("numeric(18,2)");
        builder.Property(f => f.ParsedJson).HasColumnType("jsonb").HasColumnName("parsed_json");
        builder.Property(f => f.OcrConfidenceScore).HasColumnType("numeric(5,4)");
        builder.Property(f => f.OcrStatus).IsRequired().HasMaxLength(20).HasDefaultValue("PENDING");
        builder.HasIndex(f => f.FilingId);
        builder.HasIndex(f => f.AssesseeId);
    }
}
