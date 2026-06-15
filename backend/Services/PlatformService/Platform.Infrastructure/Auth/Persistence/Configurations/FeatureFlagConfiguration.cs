using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="FeatureFlag"/>.
/// Maps to <c>auth.feature_flag</c>.
/// </summary>
public sealed class FeatureFlagConfiguration : IEntityTypeConfiguration<FeatureFlag>
{
    public void Configure(EntityTypeBuilder<FeatureFlag> builder)
    {
        builder.ToTable("feature_flag");

        builder.HasKey(f => f.Id);
        builder.Property(f => f.Id).HasColumnName("id");

        builder.Property(f => f.FlagKey)
            .HasColumnName("flag_key")
            .HasMaxLength(100)
            .IsRequired();

        builder.HasIndex(f => f.FlagKey)
            .IsUnique()
            .HasDatabaseName("ix_feature_flag_flag_key");

        builder.Property(f => f.IsEnabled)
            .HasColumnName("is_enabled")
            .IsRequired();

        builder.Property(f => f.Description)
            .HasColumnName("description")
            .HasMaxLength(500);

        builder.Property(f => f.CreatedAt).HasColumnName("created_at");
        builder.Property(f => f.UpdatedAt).HasColumnName("updated_at");
        builder.Property(f => f.DeletedAt).HasColumnName("deleted_at");
    }
}
