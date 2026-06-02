using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AiConfigurationConfiguration : IEntityTypeConfiguration<AiConfiguration>
{
    public void Configure(EntityTypeBuilder<AiConfiguration> builder)
    {
        builder.ToTable("ai_configuration");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");
        builder.Property(c => c.OcrProvider).HasColumnName("ocr_provider").HasMaxLength(50);
        builder.Property(c => c.OcrModel).HasColumnName("ocr_model").HasMaxLength(100);
        builder.Property(c => c.OcrTier).HasColumnName("ocr_tier").HasMaxLength(20);
        builder.Property(c => c.ConfidenceThreshold).HasColumnName("confidence_threshold").HasColumnType("numeric(3,2)");
        builder.Property(c => c.OcrEnabled).HasColumnName("ocr_enabled");
        builder.Property(c => c.AutoClassifyEnabled).HasColumnName("auto_classify_enabled");
        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        builder.Ignore(c => c.DomainEvents);
    }
}
