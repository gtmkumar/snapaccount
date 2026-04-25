using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the notification schema.
/// Implements <see cref="INotificationDbContext"/> so Application layer handlers
/// can depend on the interface (never the concrete class).
/// </summary>
public class NotificationServiceDbContext(
    DbContextOptions<NotificationServiceDbContext> options)
    : BaseDbContext(options), INotificationDbContext
{
    public DbSet<NotificationEvent> NotificationEvents => Set<NotificationEvent>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<NotificationTemplate> NotificationTemplates => Set<NotificationTemplate>();
    public DbSet<NotificationLogEntry> NotificationLog => Set<NotificationLogEntry>();
    public DbSet<DlqItem> DlqItems => Set<DlqItem>();
    public DbSet<PushToken> PushTokens => Set<PushToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("notification");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(NotificationServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
