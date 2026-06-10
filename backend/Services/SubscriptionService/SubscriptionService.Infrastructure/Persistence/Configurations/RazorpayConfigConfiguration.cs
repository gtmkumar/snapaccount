using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="RazorpayConfig"/> → <c>subscription.razorpay_config</c>.
/// Single row per deployment. Use upsert pattern (insert-or-update) in the command handler.
/// </summary>
public class RazorpayConfigConfiguration : IEntityTypeConfiguration<RazorpayConfig>
{
    public void Configure(EntityTypeBuilder<RazorpayConfig> builder)
    {
        builder.ToTable("razorpay_config");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");
        builder.Property(c => c.KeyId).HasColumnName("key_id").HasMaxLength(100).IsRequired();
        builder.Property(c => c.EncryptedKeySecret).HasColumnName("encrypted_key_secret").HasMaxLength(1000).IsRequired();
        builder.Property(c => c.EncryptedWebhookSecret).HasColumnName("encrypted_webhook_secret").HasMaxLength(1000);
        builder.Property(c => c.TestMode).HasColumnName("test_mode");
        builder.Property(c => c.IsEnabled).HasColumnName("is_enabled");
        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        builder.Property(c => c.CreatedBy).HasColumnName("created_by");
        builder.Property(c => c.UpdatedBy).HasColumnName("updated_by");

        builder.Ignore(c => c.DomainEvents);
    }
}
