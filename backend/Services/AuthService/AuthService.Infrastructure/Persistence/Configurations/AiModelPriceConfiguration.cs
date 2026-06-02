using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AiModelPriceConfiguration : IEntityTypeConfiguration<AiModelPrice>
{
    public void Configure(EntityTypeBuilder<AiModelPrice> builder)
    {
        builder.ToTable("ai_model_price");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(p => p.Model).HasColumnName("model").HasMaxLength(100);
        builder.Property(p => p.InputPerMillion).HasColumnName("input_per_million").HasColumnType("numeric(12,4)");
        builder.Property(p => p.OutputPerMillion).HasColumnName("output_per_million").HasColumnType("numeric(12,4)");
        builder.Property(p => p.PerPage).HasColumnName("per_page").HasColumnType("numeric(12,4)");
        builder.Property(p => p.Currency).HasColumnName("currency").HasMaxLength(8);
        builder.Property(p => p.IsActive).HasColumnName("is_active");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.HasIndex(p => new { p.Provider, p.Model }).IsUnique().HasFilter("deleted_at IS NULL");
        builder.Ignore(p => p.DomainEvents);
    }
}
