using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for WebhookIdempotencyKey → loan.webhook_idempotency_keys table.</summary>
public sealed class WebhookIdempotencyKeyConfiguration : IEntityTypeConfiguration<WebhookIdempotencyKey>
{
    public void Configure(EntityTypeBuilder<WebhookIdempotencyKey> builder)
    {
        builder.ToTable("webhook_idempotency_keys");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.IdempotencyKey).HasMaxLength(255).IsRequired();
        builder.Property(x => x.BankId).IsRequired();
        builder.Property(x => x.ReceivedAt).IsRequired();
        builder.Property(x => x.ExpiresAt).IsRequired();

        // Unique constraint on (bank_id, idempotency_key) for deduplication
        builder.HasIndex(x => new { x.BankId, x.IdempotencyKey }).IsUnique();
        builder.HasIndex(x => x.ExpiresAt); // for TTL cleanup
    }
}
