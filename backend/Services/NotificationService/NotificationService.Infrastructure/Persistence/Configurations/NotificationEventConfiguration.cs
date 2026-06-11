using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationEvent"/> to <c>notification.notification_event</c>.
/// SWEEP-FIX: notification.notification_event does NOT exist in the DB.
/// DDL HANDOFF (db-engineer): CREATE TABLE notification.notification_event (
///   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
///   event_code VARCHAR(200) NOT NULL UNIQUE,
///   event_name VARCHAR(300) NOT NULL,
///   category VARCHAR(50) NOT NULL,
///   default_channels VARCHAR(200) NOT NULL,
///   is_active BOOLEAN NOT NULL DEFAULT TRUE,
///   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
///   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
///   deleted_at TIMESTAMPTZ,
///   created_by UUID,
///   updated_by UUID
/// );
/// EF will NOT query this table at startup (lazy DbSet), so the service starts without 500.
/// Seeder calls will fail at runtime until DDL is applied.
/// </summary>
public sealed class NotificationEventConfiguration : IEntityTypeConfiguration<NotificationEvent>
{
    public void Configure(EntityTypeBuilder<NotificationEvent> builder)
    {
        builder.ToTable("notification_event", "notification");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.EventCode).HasColumnName("event_code").HasMaxLength(200).IsRequired();
        builder.Property(e => e.EventName).HasColumnName("event_name").HasMaxLength(300).IsRequired();
        builder.Property(e => e.Category).HasColumnName("category").HasMaxLength(50).IsRequired();
        builder.Property(e => e.DefaultChannels).HasColumnName("default_channels").HasMaxLength(200).IsRequired();
        builder.Property(e => e.IsActive).HasColumnName("is_active").IsRequired();

        builder.Property(e => e.CreatedAt).HasColumnName("created_at");
        builder.Property(e => e.UpdatedAt).HasColumnName("updated_at");
        builder.Property(e => e.DeletedAt).HasColumnName("deleted_at");
        builder.Property(e => e.CreatedBy).HasColumnName("created_by");
        builder.Property(e => e.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(e => e.EventCode).IsUnique();

        builder.HasQueryFilter(e => e.DeletedAt == null);
    }
}
