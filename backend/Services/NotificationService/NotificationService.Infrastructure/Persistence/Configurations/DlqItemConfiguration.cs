using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="DlqItem"/> to <c>notification.dlq_items</c>.
///
/// SWEEP-FIX WEB-07: DB column reconciliation against actual notification.dlq_items schema:
///   EventCode   → event_type          ✓ (was correct)
///   Channel     → channel             ✓ (was correct)
///   LastErrorMessage → failure_reason ✓ (was correct)
///   RetryCount  → retry_count         ✓ (was correct)
///   ExhaustedAt → last_failed_at      ✓ (was correct)
///   IsResolved (bool) → resolution_status (varchar OPEN/REQUEUED/ACKNOWLEDGED/DROPPED):
///     false = 'OPEN', true = 'ACKNOWLEDGED'. Uses value converter.
///
/// Removed mappings (columns do not exist in DB):
///   Locale       (no locale column — use 'en' default in entity; not persisted)
///   OriginalPayload (no original_payload column — DB has payload jsonb instead)
/// </summary>
public sealed class DlqItemConfiguration : IEntityTypeConfiguration<DlqItem>
{
    public void Configure(EntityTypeBuilder<DlqItem> builder)
    {
        builder.ToTable("dlq_items", "notification");
        builder.HasKey(d => d.Id);

        builder.Property(d => d.Id).HasColumnName("id");
        builder.Property(d => d.UserId).HasColumnName("user_id");
        builder.Property(d => d.EventCode).HasColumnName("event_type").HasMaxLength(200).IsRequired();

        // channel VARCHAR(30) + CHECK ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP').
        builder.Property(d => d.Channel).HasColumnName("channel")
            .HasConversion(new UpperSnakeEnumConverter<NotificationChannel>())
            .HasMaxLength(30).IsRequired();

        // SWEEP-FIX WEB-07: Locale and OriginalPayload have no DB columns — ignore.
        builder.Ignore(d => d.Locale);
        builder.Ignore(d => d.OriginalPayload);

        builder.Property(d => d.LastErrorMessage).HasColumnName("failure_reason").IsRequired();
        builder.Property(d => d.RetryCount).HasColumnName("retry_count");
        builder.Property(d => d.ExhaustedAt).HasColumnName("last_failed_at").IsRequired();

        // SWEEP-FIX WEB-07: resolution_status is VARCHAR (OPEN/REQUEUED/ACKNOWLEDGED/DROPPED).
        // Map bool IsResolved to the varchar using a value converter:
        //   false → 'OPEN', true → 'ACKNOWLEDGED'.
        builder.Property(d => d.IsResolved)
            .HasColumnName("resolution_status")
            .HasMaxLength(30)
            .IsRequired()
            .HasConversion(
                b => b ? "ACKNOWLEDGED" : "OPEN",
                s => s == "ACKNOWLEDGED" || s == "DROPPED");

        builder.Property(d => d.CreatedAt).HasColumnName("created_at");
        builder.Property(d => d.UpdatedAt).HasColumnName("updated_at");
        builder.Property(d => d.DeletedAt).HasColumnName("deleted_at");
        builder.Property(d => d.CreatedBy).HasColumnName("created_by");
        builder.Property(d => d.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(d => d.DeletedAt == null);
    }
}
