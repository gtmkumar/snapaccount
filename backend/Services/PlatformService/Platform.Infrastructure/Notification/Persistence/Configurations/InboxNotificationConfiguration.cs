using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps the <see cref="InboxNotification"/> read model to the real
/// <c>notification.notification</c> table (partitioned; created by SQL migration 008).
/// Explicit column names are required because the entity name does not match the table
/// and there are no EF migrations for this service.
/// </summary>
public sealed class InboxNotificationConfiguration : IEntityTypeConfiguration<InboxNotification>
{
    public void Configure(EntityTypeBuilder<InboxNotification> builder)
    {
        builder.ToTable("notification", "notification");
        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnName("id");
        builder.Property(n => n.UserId).HasColumnName("user_id");
        builder.Property(n => n.Channel).HasColumnName("channel");
        builder.Property(n => n.EventType).HasColumnName("event_type");
        builder.Property(n => n.Title).HasColumnName("title");
        builder.Property(n => n.Body).HasColumnName("body");
        builder.Property(n => n.IsRead).HasColumnName("is_read");
        builder.Property(n => n.ReadAt).HasColumnName("read_at");
        builder.Property(n => n.Status).HasColumnName("status");
        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.DeletedAt).HasColumnName("deleted_at");
        builder.Property(n => n.ReferenceType).HasColumnName("reference_type");
        builder.Property(n => n.ReferenceId).HasColumnName("reference_id");
        builder.Property(n => n.DataPayload).HasColumnName("data_payload");
    }
}
