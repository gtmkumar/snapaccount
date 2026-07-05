using SnapAccount.Shared.Domain;

namespace SubscriptionService.Domain.Events;

/// <summary>Raised when a subscription is upgraded or downgraded to a new plan.</summary>
public sealed record SubscriptionPlanChangedEvent(
    Guid SubscriptionId,
    Guid OrganizationId,
    Guid NewPlanId) : DomainEvent;
