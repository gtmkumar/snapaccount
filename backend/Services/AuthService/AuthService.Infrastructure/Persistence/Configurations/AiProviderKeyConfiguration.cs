using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AiProviderKeyConfiguration : IEntityTypeConfiguration<AiProviderKey>
{
    public void Configure(EntityTypeBuilder<AiProviderKey> builder)
    {
        builder.ToTable("ai_provider_key");
        builder.HasKey(k => k.Id);
        builder.Property(k => k.Id).HasColumnName("id");
        builder.Property(k => k.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(k => k.EncryptedKey).HasColumnName("encrypted_key");
        builder.Property(k => k.KeyLast4).HasColumnName("key_last4").HasMaxLength(8);
        builder.Property(k => k.CreatedAt).HasColumnName("created_at");
        builder.Property(k => k.UpdatedAt).HasColumnName("updated_at");
        builder.Property(k => k.DeletedAt).HasColumnName("deleted_at");
        builder.HasIndex(k => k.Provider).IsUnique().HasFilter("deleted_at IS NULL");
        builder.Ignore(k => k.IsConfigured);
        builder.Ignore(k => k.DomainEvents);
    }
}
