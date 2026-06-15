using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class PasswordResetTokenConfiguration : IEntityTypeConfiguration<PasswordResetToken>
{
    public void Configure(EntityTypeBuilder<PasswordResetToken> builder)
    {
        builder.ToTable("password_reset_token");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.UserId).HasColumnName("user_id");
        builder.Property(r => r.TokenHash).HasColumnName("token_hash").HasMaxLength(256).IsRequired();
        builder.Property(r => r.ExpiresAt).HasColumnName("expires_at");
        builder.Property(r => r.UsedAt).HasColumnName("used_at");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(r => r.TokenHash).IsUnique();
        builder.HasIndex(r => r.UserId);
        builder.HasIndex(r => r.ExpiresAt);

        builder.Ignore(r => r.DomainEvents);
    }
}
