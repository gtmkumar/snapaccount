using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core <see cref="SaveChangesInterceptor"/> that automatically sets
/// <c>created_at</c>, <c>updated_at</c>, <c>created_by</c>, and <c>updated_by</c>
/// on all <see cref="BaseAuditableEntity"/> instances before the database write.
///
/// This is the Jason Taylor CleanArchitecture pattern — audit columns are not set
/// manually in handlers. Instead this interceptor is registered in DI and wired
/// into each service's DbContext via <c>options.AddInterceptors()</c>.
///
/// The <c>ICurrentUser.UserId</c> (from the Firebase JWT) is written as a string
/// representation of the user's UUID into both <c>CreatedBy</c> and <c>UpdatedBy</c>.
/// Unauthenticated writes (e.g. background jobs) leave these fields null.
/// </summary>
public sealed class AuditableEntityInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUser _currentUser;
    private readonly TimeProvider _timeProvider;

    /// <summary>
    /// Initialises the interceptor with the current-request user context and UTC clock.
    /// Both are scoped — one instance per HTTP request.
    /// </summary>
    public AuditableEntityInterceptor(ICurrentUser currentUser, TimeProvider timeProvider)
    {
        _currentUser = currentUser;
        _timeProvider = timeProvider;
    }

    /// <inheritdoc />
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        UpdateEntities(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    /// <inheritdoc />
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        UpdateEntities(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    /// <summary>
    /// Iterates ChangeTracker entries of type <see cref="BaseAuditableEntity"/> and stamps
    /// audit fields. Called synchronously before both sync and async SaveChanges paths.
    /// </summary>
    public void UpdateEntities(DbContext? context)
    {
        if (context is null) return;

        var utcNow = _timeProvider.GetUtcNow().UtcDateTime;
        var userId = _currentUser.IsAuthenticated
            ? _currentUser.UserId.ToString()
            : null;

        foreach (var entry in context.ChangeTracker.Entries<BaseAuditableEntity>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified
                || entry.HasChangedOwnedEntities())
            {
                entry.Entity.UpdatedAt = utcNow;
                entry.Entity.UpdatedBy = userId;

                if (entry.State == EntityState.Added)
                {
                    entry.Entity.CreatedAt = utcNow;
                    entry.Entity.CreatedBy = userId;
                }
            }
        }
    }
}

/// <summary>
/// Extension methods on <see cref="EntityEntry"/> used by <see cref="AuditableEntityInterceptor"/>.
/// </summary>
public static class EntityEntryExtensions
{
    /// <summary>
    /// Returns <c>true</c> when any owned navigation on this entry has been
    /// added or modified — used to catch value-object mutations.
    /// </summary>
    public static bool HasChangedOwnedEntities(this EntityEntry entry) =>
        entry.References.Any(r =>
            r.TargetEntry is not null &&
            r.TargetEntry.Metadata.IsOwned() &&
            r.TargetEntry.State is EntityState.Added or EntityState.Modified);
}
