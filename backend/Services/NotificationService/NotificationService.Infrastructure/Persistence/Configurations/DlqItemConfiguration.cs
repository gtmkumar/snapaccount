using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="DlqItem"/> to <c>notification.dlq_items</c> (created by SQL
/// migration 017, EF-aligned by migration 060).
///
/// Column reconciliation:
///   EventCode → event_type, LastErrorMessage → failure_reason,
///   ExhaustedAt → last_failed_at.
///   OriginalPayload → original_payload (plain-text column added by 060; the JSONB
///   payload column is left untouched), IsResolved → is_resolved (added by 060),
///   Locale → locale (added by 060).
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

        builder.Property(d => d.Locale).HasColumnName("locale").HasMaxLength(20).IsRequired();
        builder.Property(d => d.OriginalPayload).HasColumnName("original_payload");
        builder.Property(d => d.LastErrorMessage).HasColumnName("failure_reason").IsRequired();
        builder.Property(d => d.RetryCount).HasColumnName("retry_count");
        builder.Property(d => d.ExhaustedAt).HasColumnName("last_failed_at").IsRequired();
        builder.Property(d => d.IsResolved).HasColumnName("is_resolved").IsRequired();

        builder.Property(d => d.CreatedAt).HasColumnName("created_at");
        builder.Property(d => d.UpdatedAt).HasColumnName("updated_at");
        builder.Property(d => d.DeletedAt).HasColumnName("deleted_at");
        builder.Property(d => d.CreatedBy).HasColumnName("created_by");
        builder.Property(d => d.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(d => d.DeletedAt == null);
    }
}
