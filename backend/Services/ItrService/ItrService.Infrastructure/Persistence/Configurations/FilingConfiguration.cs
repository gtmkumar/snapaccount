using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Filing"/>.
/// P6-HANDOFF-18: tax_slab_version_id + computation_jsonb are immutable once set.
/// P6-HANDOFF-20: itr_v_uri is NEVER persisted — only itr_v_object_key is stored.
/// </summary>
public sealed class FilingConfiguration : IEntityTypeConfiguration<Filing>
{
    public void Configure(EntityTypeBuilder<Filing> builder)
    {
        builder.ToTable("filings");
        builder.HasKey(f => f.Id);
        builder.Property(f => f.AssesseeId).IsRequired();
        builder.Property(f => f.AssessmentYear).IsRequired().HasMaxLength(20);
        builder.Property(f => f.ItrFormType).IsRequired().HasMaxLength(10).HasDefaultValue("ITR-1");
        builder.Property(f => f.Regime).IsRequired().HasMaxLength(5).HasDefaultValue("NEW");
        builder.Property(f => f.Status).IsRequired().HasMaxLength(50).HasDefaultValue("DRAFT");
        builder.Property(f => f.ComputationJsonb).HasColumnType("jsonb").HasColumnName("computation_jsonb");
        builder.Property(f => f.ComputationHash).HasMaxLength(64);
        builder.Property(f => f.SalaryIncome).HasColumnType("numeric(18,2)");
        builder.Property(f => f.HousePropertyIncome).HasColumnType("numeric(18,2)");
        builder.Property(f => f.BusinessIncome).HasColumnType("numeric(18,2)");
        builder.Property(f => f.CapitalGains).HasColumnType("numeric(18,2)");
        builder.Property(f => f.OtherIncome).HasColumnType("numeric(18,2)");
        builder.Property(f => f.TotalDeductions).HasColumnType("numeric(18,2)");
        builder.Property(f => f.ItrVObjectKey).HasMaxLength(500);
        builder.Property(f => f.AcknowledgementNumber).HasMaxLength(100);
        builder.Property(f => f.CaRejectionReason).HasMaxLength(2000);
        builder.HasIndex(f => f.AssesseeId);
        builder.HasIndex(f => new { f.AssesseeId, f.AssessmentYear }).IsUnique();
    }
}
