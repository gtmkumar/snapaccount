namespace SnapAccount.Shared.Domain;

/// <summary>
/// Minimal base entity for all SnapAccount domain entities.
/// Holds only the UUID primary key and the domain event collection.
/// Follows the Jason Taylor CleanArchitecture split:
///   - <see cref="BaseEntity"/> — Id + domain events only (no audit columns)
///   - <see cref="BaseAuditableEntity"/> — extends with audit/soft-delete columns
/// Entities that need audit tracking inherit <see cref="BaseAuditableEntity"/>.
/// </summary>
public abstract class BaseEntity
{
    /// <summary>UUID primary key. Generated on construction and never changed.</summary>
    public Guid Id { get; protected set; } = Guid.NewGuid();

    private readonly List<IDomainEvent> _domainEvents = [];

    /// <summary>Domain events raised during this entity's lifetime, dispatched on SaveChanges.</summary>
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    /// <summary>Enqueues a domain event for dispatch by <see cref="SnapAccount.Shared.Infrastructure.Persistence.Interceptors.DispatchDomainEventsInterceptor"/>.</summary>
    public void AddDomainEvent(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    /// <summary>Removes a previously enqueued domain event (e.g. on rollback/cancel).</summary>
    public void RemoveDomainEvent(IDomainEvent domainEvent) => _domainEvents.Remove(domainEvent);

    /// <summary>Clears all pending domain events — called by the interceptor after dispatch.</summary>
    public void ClearDomainEvents() => _domainEvents.Clear();
}