using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="PlatformConfig"/>.
/// Maps to <c>auth.platform_config</c>.
/// </summary>
public sealed class PlatformConfigConfiguration : IEntityTypeConfiguration<PlatformConfig>
{
    public void Configure(EntityTypeBuilder<PlatformConfig> builder)
    {
        builder.ToTable("platform_config");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");

        builder.Property(c => c.ConfigKey)
            .HasColumnName("config_key")
            .HasMaxLength(100)
            .IsRequired();

        builder.HasIndex(c => c.ConfigKey)
            .IsUnique()
            .HasDatabaseName("ix_platform_config_config_key");

        builder.Property(c => c.ConfigValueJson)
            .HasColumnName("config_value")
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
    }
}
