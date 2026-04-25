using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="TaxSlabVersion"/>.</summary>
public sealed class TaxSlabVersionConfiguration : IEntityTypeConfiguration<TaxSlabVersion>
{
    public void Configure(EntityTypeBuilder<TaxSlabVersion> builder)
    {
        builder.ToTable("tax_slab_versions");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.AssessmentYear).IsRequired().HasMaxLength(20).HasColumnName("ay");
        builder.Property(t => t.Regime).IsRequired().HasMaxLength(5);
        builder.Property(t => t.SlabsJson).IsRequired().HasColumnType("jsonb").HasColumnName("slabs_jsonb");
        builder.Property(t => t.StandardDeduction).HasColumnType("numeric(18,2)");
        builder.Property(t => t.Rebate87AIncomeLimit).HasColumnType("numeric(18,2)");
        builder.Property(t => t.Rebate87AMaxAmount).HasColumnType("numeric(18,2)");
        builder.Property(t => t.SurchargeJson).HasColumnType("jsonb").HasColumnName("surcharge_jsonb");
        builder.Property(t => t.CessRatePct).HasColumnType("numeric(5,2)").HasDefaultValue(4m);
        builder.HasIndex(t => new { t.AssessmentYear, t.Regime });
    }
}
