using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationLogEntry"/> (the dispatch record) to
/// <c>notification.notification_log</c>.
///
/// Migration 066 confirmed: user_id, event_code, channel, language, rendered_body, dedupe_key
/// columns exist in the DB. All entity properties are fully mapped.
/// Provider/cost/retry/status/failure_reason columns from earlier migrations are also mapped.
/// </summary>
public sealed class NotificationLogEntryConfiguration : IEntityTypeConfiguration<NotificationLogEntry>
{
    public void Configure(EntityTypeBuilder<NotificationLogEntry> builder)
    {
        builder.ToTable("notification_log", "notification");
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Id).HasColumnName("id");

        // Migration 066: user_id, event_code, channel, language, rendered_body, dedupe_key
        // columns confirmed present in notification.notification_log — re-enable mappings.
        builder.Property(l => l.UserId).HasColumnName("user_id");
        builder.Property(l => l.EventCode).HasColumnName("event_code").HasMaxLength(200);
        builder.Property(l => l.Channel)
            .HasColumnName("channel")
            .HasConversion(new UpperSnakeEnumConverter<NotificationChannel>())
            .HasMaxLength(30);
        builder.Property(l => l.Locale).HasColumnName("language").HasMaxLength(10);
        builder.Property(l => l.RenderedBody).HasColumnName("rendered_body");
        builder.Property(l => l.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(128);

        // Status is present in DB (migration 017) — map it.
        builder.Property(l => l.Status).HasColumnName("status")
            .HasConversion(new UpperSnakeEnumConverter<DispatchStatus>())
            .HasMaxLength(20).IsRequired();

        // Reuse the 008/017 provider columns.
        builder.Property(l => l.ProviderMessageId).HasColumnName("provider_message_id").HasMaxLength(300);
        builder.Property(l => l.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(l => l.CostInr).HasColumnName("cost_inr").HasColumnType("numeric(10,4)");
        builder.Property(l => l.RetryCount).HasColumnName("retry_count");
        builder.Property(l => l.ErrorMessage).HasColumnName("failure_reason");

        // DB also has notification_id (FK to notification table) — shadow property
        builder.Property<Guid?>("NotificationId").HasColumnName("notification_id");

        builder.Property(l => l.CreatedAt).HasColumnName("created_at");
        builder.Property(l => l.UpdatedAt).HasColumnName("updated_at");
        builder.Property(l => l.DeletedAt).HasColumnName("deleted_at");
        builder.Property(l => l.CreatedBy).HasColumnName("created_by");
        builder.Property(l => l.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(l => l.DeletedAt == null);
    }
}
