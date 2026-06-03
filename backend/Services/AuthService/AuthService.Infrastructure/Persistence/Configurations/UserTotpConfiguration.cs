using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class UserTotpConfiguration : IEntityTypeConfiguration<UserTotp>
{
    public void Configure(EntityTypeBuilder<UserTotp> builder)
    {
        builder.ToTable("user_totp");

        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasColumnName("id");
        builder.Property(t => t.UserId).HasColumnName("user_id");
        builder.Property(t => t.SecretEncrypted).HasColumnName("secret_encrypted").IsRequired();
        builder.Property(t => t.IsEnabled).HasColumnName("is_enabled");
        builder.Property(t => t.ConfirmedAt).HasColumnName("confirmed_at");
        builder.Property(t => t.RecoveryCodes).HasColumnName("recovery_codes");
        builder.Property(t => t.CreatedAt).HasColumnName("created_at");
        builder.Property(t => t.UpdatedAt).HasColumnName("updated_at");
        builder.Property(t => t.DeletedAt).HasColumnName("deleted_at");
        builder.Property(t => t.CreatedBy).HasColumnName("created_by");
        builder.Property(t => t.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(t => t.UserId).IsUnique();

        builder.Ignore(t => t.DomainEvents);
    }
}
