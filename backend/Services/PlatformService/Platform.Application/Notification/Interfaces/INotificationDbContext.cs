using Microsoft.EntityFrameworkCore;
using NotificationService.Domain.Entities;

namespace NotificationService.Application.Interfaces;

/// <summary>
/// Application-layer abstraction over the notification schema database context.
/// Query handlers use this interface for direct LINQ projection (JT pattern).
/// </summary>
public interface INotificationDbContext
{
    DbSet<NotificationEvent> NotificationEvents { get; }
    DbSet<NotificationPreference> NotificationPreferences { get; }
    DbSet<NotificationTemplate> NotificationTemplates { get; }
    DbSet<NotificationLogEntry> NotificationLog { get; }

    /// <summary>In-app inbox read model (maps to the real notification.notification table).</summary>
    DbSet<InboxNotification> InboxNotifications { get; }

    DbSet<DlqItem> DlqItems { get; }
    DbSet<PushToken> PushTokens { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
