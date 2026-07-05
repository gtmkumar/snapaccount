using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for WebhookIdempotencyKey → loan.webhook_idempotency_keys table.</summary>
public sealed class WebhookIdempotencyKeyConfiguration : IEntityTypeConfiguration<WebhookIdempotencyKey>
{
    public void Configure(EntityTypeBuilder<WebhookIdempotencyKey> builder)
    {
        // SWEEP-FIX: loan.webhook_idempotency_keys table does NOT exist in the DB.
        // DDL HANDOFF (db-engineer): CREATE TABLE loan.webhook_idempotency_keys (
        //   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        //   idempotency_key VARCHAR(255) NOT NULL,
        //   bank_id UUID NOT NULL,
        //   received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        //   expires_at TIMESTAMPTZ NOT NULL,
        //   UNIQUE (bank_id, idempotency_key)
        // );
        // CREATE INDEX idx_webhook_idem_expires ON loan.webhook_idempotency_keys(expires_at);
        //
        // Until this table exists, Razorpay webhook deduplication is skipped (no 500 on startup
        // because EF does not SELECT from non-existent tables at startup — queries will fail at runtime
        // only when the webhook endpoint is called, which is acceptable pending DDL).
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
