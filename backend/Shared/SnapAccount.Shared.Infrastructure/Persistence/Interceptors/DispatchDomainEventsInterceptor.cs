using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core <see cref="SaveChangesInterceptor"/> that collects domain events from all
/// tracked <see cref="BaseEntity"/> instances and dispatches them via MediatR
/// <em>before</em> the database write completes.
///
/// This is the Jason Taylor CleanArchitecture pattern for domain event dispatch.
/// Domain events are dispatched in the same transaction as the aggregate change,
/// guaranteeing consistency between aggregate state and event observers within
/// the same service boundary.
///
/// Cross-service events are published via <c>IEventPublisher</c> → Google Pub/Sub
/// inside the MediatR notification handlers, keeping service coupling loose.
///
/// Registration: each service's <c>DependencyInjection.cs</c> calls
/// <c>services.AddScoped&lt;ISaveChangesInterceptor, DispatchDomainEventsInterceptor&gt;()</c>
/// and passes the resolved interceptors into <c>options.AddInterceptors()</c>.
/// </summary>
public sealed class DispatchDomainEventsInterceptor : SaveChangesInterceptor
{
    private readonly IMediator _mediator;

    /// <summary>Injects the MediatR mediator for publishing domain event notifications.</summary>
    public DispatchDomainEventsInterceptor(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <inheritdoc />
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        DispatchDomainEvents(eventData.Context).GetAwaiter().GetResult();
        return base.SavingChanges(eventData, result);
    }

    /// <inheritdoc />
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        await DispatchDomainEvents(eventData.Context);
        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    /// <summary>
    /// Collects all pending domain events from tracked entities, clears them
    /// (so re-saves do not re-dispatch), then publishes each via MediatR.
    /// </summary>
    private async Task DispatchDomainEvents(DbContext? context)
    {
        if (context is null) return;

        var entities = context.ChangeTracker
            .Entries<BaseEntity>()
            .Where(e => e.Entity.DomainEvents.Count > 0)
            .Select(e => e.Entity)
            .ToList();

        var domainEvents = entities
            .SelectMany(e => e.DomainEvents)
            .ToList();

        // Clear events before dispatch to prevent re-dispatch on nested saves
        entities.ForEach(e => e.ClearDomainEvents());

        foreach (var domainEvent in domainEvents)
            await _mediator.Publish(domainEvent);
    }
}
