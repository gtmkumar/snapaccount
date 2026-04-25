using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="DeductionSection"/>.</summary>
public sealed class DeductionSectionConfiguration : IEntityTypeConfiguration<DeductionSection>
{
    public void Configure(EntityTypeBuilder<DeductionSection> builder)
    {
        builder.ToTable("deduction_sections");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.SectionCode).IsRequired().HasMaxLength(20);
        builder.Property(d => d.Name).IsRequired().HasMaxLength(200);
        builder.Property(d => d.Description).HasMaxLength(2000);
        builder.Property(d => d.MaxLimit).HasColumnType("numeric(18,2)");
        builder.Property(d => d.AssessmentYear).IsRequired().HasMaxLength(20).HasColumnName("ay");
        builder.HasIndex(d => new { d.SectionCode, d.AssessmentYear }).IsUnique();
    }
}
