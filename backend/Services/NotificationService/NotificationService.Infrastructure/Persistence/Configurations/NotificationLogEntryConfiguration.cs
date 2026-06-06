using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationLogEntry"/> (the dispatch record) to
/// <c>notification.notification_log</c>.
///
/// 008 created notification_log as a provider-delivery log; the dispatch-record
/// columns (user_id, event_code, channel, language, rendered_body, dedupe_key) are
/// added by migration 060. Provider/cost/retry/status/failure_reason columns from
/// 008/017 are reused.
/// </summary>
public sealed class NotificationLogEntryConfiguration : IEntityTypeConfiguration<NotificationLogEntry>
{
    public void Configure(EntityTypeBuilder<NotificationLogEntry> builder)
    {
        builder.ToTable("notification_log", "notification");
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Id).HasColumnName("id");

        // Dispatch-record columns (added by migration 060).
        builder.Property(l => l.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(l => l.EventCode).HasColumnName("event_code").HasMaxLength(200).IsRequired();

        // channel VARCHAR(30) + CHECK ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP').
        builder.Property(l => l.Channel).HasColumnName("channel")
            .HasConversion(new UpperSnakeEnumConverter<NotificationChannel>())
            .HasMaxLength(30).IsRequired();

        builder.Property(l => l.Locale).HasColumnName("language").HasMaxLength(20).IsRequired();
        builder.Property(l => l.RenderedBody).HasColumnName("rendered_body");
        builder.Property(l => l.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(128);

        // status VARCHAR(20) + CHECK ('QUEUED','SENT','DELIVERED','FAILED','BOUNCED') (migration 017).
        // DispatchStatus.Suppressed is never persisted to notification_log (only Sent/Failed are),
        // so the UPPER_SNAKE vocabulary stays within the CHECK set.
        builder.Property(l => l.Status).HasColumnName("status")
            .HasConversion(new UpperSnakeEnumConverter<DispatchStatus>())
            .HasMaxLength(20).IsRequired();

        // Reuse the 008/017 provider columns.
        builder.Property(l => l.ProviderMessageId).HasColumnName("provider_message_id").HasMaxLength(300);
        builder.Property(l => l.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(l => l.CostInr).HasColumnName("cost_inr").HasColumnType("numeric(10,4)");
        builder.Property(l => l.RetryCount).HasColumnName("retry_count");
        builder.Property(l => l.ErrorMessage).HasColumnName("failure_reason");

        builder.Property(l => l.CreatedAt).HasColumnName("created_at");
        builder.Property(l => l.UpdatedAt).HasColumnName("updated_at");
        builder.Property(l => l.DeletedAt).HasColumnName("deleted_at");
        builder.Property(l => l.CreatedBy).HasColumnName("created_by");
        builder.Property(l => l.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(l => l.DeletedAt == null);
    }
}
