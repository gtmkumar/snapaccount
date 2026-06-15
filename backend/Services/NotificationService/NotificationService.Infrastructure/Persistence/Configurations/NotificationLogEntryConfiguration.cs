using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationLogEntry"/> (the dispatch record) to
/// <c>notification.notification_log</c>.
///
/// Write-path audit (2026-06-12) — every NOT NULL column verified against pg_attrdef:
///   notification_at  — NOT NULL, NO DB default → mapped to NotificationAt (DateTime), set in factory
///   provider         — NOT NULL, NO DB default → mapped to Provider (string), always set in factory
///   created_at       — NOT NULL, has now() default → safe (EF writes it via interceptor anyway)
///   updated_at       — NOT NULL, has now() default → safe
///   status           — NOT NULL, has 'QUEUED' default → safe (EF writes it)
///   retry_count      — NOT NULL, has 0 default → safe (EF writes 0)
///   language         — NOT NULL, has 'en' default → safe (EF writes it)
///
/// Type audit — uuid columns require Guid mapping, never string:
///   user_id    uuid  → UserId (Guid) — OK
///   created_by uuid  → CreatedBy (string?) — handled by BaseDbContext.GuidStringConverter
///   updated_by uuid  → UpdatedBy (string?) — handled by BaseDbContext.GuidStringConverter
/// </summary>
public sealed class NotificationLogEntryConfiguration : IEntityTypeConfiguration<NotificationLogEntry>
{
    public void Configure(EntityTypeBuilder<NotificationLogEntry> builder)
    {
        builder.ToTable("notification_log", "notification");
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Id).HasColumnName("id");

        builder.Property(l => l.UserId).HasColumnName("user_id");
        builder.Property(l => l.EventCode).HasColumnName("event_code").HasMaxLength(200);
        builder.Property(l => l.Channel)
            .HasColumnName("channel")
            .HasConversion(new UpperSnakeEnumConverter<NotificationChannel>())
            .HasMaxLength(30);
        builder.Property(l => l.Locale).HasColumnName("language").HasMaxLength(10);
        builder.Property(l => l.RenderedBody).HasColumnName("rendered_body");
        builder.Property(l => l.DedupeKey).HasColumnName("dedupe_key").HasMaxLength(128);

        // status: UpperSnakeEnumConverter; NOT NULL with DB default 'QUEUED' — safe to omit on insert.
        builder.Property(l => l.Status).HasColumnName("status")
            .HasConversion(new UpperSnakeEnumConverter<DispatchStatus>())
            .HasMaxLength(20).IsRequired();

        // provider: NOT NULL, NO DB default. Domain entity always sets Provider in factory methods
        // (Sent → provider arg, CreateCelebration → "celebration", Failed → "unknown").
        // Do NOT add HasDefaultValue here — EF would omit the column and Postgres raises 23502.
        builder.Property(l => l.Provider).HasColumnName("provider").HasMaxLength(50).IsRequired();
        builder.Property(l => l.ProviderMessageId).HasColumnName("provider_message_id").HasMaxLength(300);

        builder.Property(l => l.CostInr).HasColumnName("cost_inr").HasColumnType("numeric(10,4)");
        // retry_count: NOT NULL, DB default 0 — EF writes the C# value (defaults to 0).
        builder.Property(l => l.RetryCount).HasColumnName("retry_count");
        builder.Property(l => l.ErrorMessage).HasColumnName("failure_reason");

        // notification_at: NOT NULL, NO DB default. Set explicitly in every factory method
        // to DateTime.UtcNow (= "when the notification event occurred").
        // MUST NOT use HasDefaultValueSql("NOW()") + ValueGeneratedOnAdd — those patterns cause
        // EF to omit the column from INSERT (it treats it as server-generated), so Postgres gets
        // no value and raises 23502 because there is no actual server-side DEFAULT on the column.
        builder.Property(l => l.NotificationAt)
            .HasColumnName("notification_at")
            .IsRequired();

        // notification_id: nullable (migration 087). No HasDefaultValue — EF writes NULL for
        // Guid? shadow property on test-send and celebration paths (no parent notification row).
        builder.Property<Guid?>("NotificationId")
            .HasColumnName("notification_id");

        builder.Property(l => l.CreatedAt).HasColumnName("created_at");
        builder.Property(l => l.UpdatedAt).HasColumnName("updated_at");
        builder.Property(l => l.DeletedAt).HasColumnName("deleted_at");
        builder.Property(l => l.CreatedBy).HasColumnName("created_by");
        builder.Property(l => l.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(l => l.DeletedAt == null);
    }
}
