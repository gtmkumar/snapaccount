namespace NotificationService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the notification schema database context.
/// Phase 1: stub — DbSet properties will be added in Phase 2.
/// </summary>
public interface INotificationServiceDbContext
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
