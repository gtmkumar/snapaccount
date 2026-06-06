using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationEvent"/> to <c>notification.notification_event</c>
/// (created by SQL migration 060 — SQL is canonical, no EF migrations).
/// This is the event catalogue the seeder populates first.
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
