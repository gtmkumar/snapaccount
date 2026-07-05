using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationPreference"/> to <c>notification.notification_preference</c>
/// (created by SQL migrations 008 + 017 — SQL is canonical, no EF migrations).
///
/// Column reconciliation:
///   EventCode → event_type, DoNotDisturb → dnd_enabled.
///   QuietHoursStart / QuietHoursEnd are "HH:mm" strings on the entity but TIME columns
///   in SQL, so a string &lt;-&gt; TimeOnly converter is applied.
/// </summary>
public sealed class NotificationPreferenceConfiguration : IEntityTypeConfiguration<NotificationPreference>
{
    public void Configure(EntityTypeBuilder<NotificationPreference> builder)
    {
        builder.ToTable("notification_preference", "notification");
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(p => p.EventCode).HasColumnName("event_type").HasMaxLength(200).IsRequired();

        builder.Property(p => p.PushEnabled).HasColumnName("push_enabled").IsRequired();
        builder.Property(p => p.SmsEnabled).HasColumnName("sms_enabled").IsRequired();
        builder.Property(p => p.EmailEnabled).HasColumnName("email_enabled").IsRequired();
        builder.Property(p => p.InAppEnabled).HasColumnName("in_app_enabled").IsRequired();

        // quiet_hours_start / quiet_hours_end are TIME columns; the entity holds "HH:mm" strings.
        builder.Property(p => p.QuietHoursStart).HasColumnName("quiet_hours_start")
            .HasColumnType("time").HasConversion(StringToTimeConverter);
        builder.Property(p => p.QuietHoursEnd).HasColumnName("quiet_hours_end")
            .HasColumnType("time").HasConversion(StringToTimeConverter);

        builder.Property(p => p.DoNotDisturb).HasColumnName("dnd_enabled").IsRequired();

        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(p => new { p.UserId, p.EventCode }).IsUnique();

        builder.HasQueryFilter(p => p.DeletedAt == null);
    }

    /// <summary>"HH:mm" string &lt;-&gt; Postgres TIME (TimeOnly). Null passes through.</summary>
    private static readonly ValueConverter<string?, TimeOnly?> StringToTimeConverter =
        new(s => s == null ? (TimeOnly?)null : TimeOnly.Parse(s),
            t => t.HasValue ? t.Value.ToString("HH\\:mm") : null);
}
