using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_token");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.UserId).HasColumnName("user_id");
        builder.Property(r => r.DeviceId).HasColumnName("device_id");
        builder.Property(r => r.TokenHash).HasColumnName("token_hash").HasMaxLength(256);
        builder.Property(r => r.IsRevoked).HasColumnName("is_revoked");
        builder.Property(r => r.RevokedAt).HasColumnName("revoked_at");
        builder.Property(r => r.RevokedReason).HasColumnName("revoked_reason").HasMaxLength(200);
        builder.Property(r => r.ExpiresAt).HasColumnName("expires_at");
        builder.Property(r => r.LastUsedAt).HasColumnName("last_used_at");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(r => r.TokenHash).IsUnique();
        builder.Ignore(r => r.DomainEvents);
    }
}
