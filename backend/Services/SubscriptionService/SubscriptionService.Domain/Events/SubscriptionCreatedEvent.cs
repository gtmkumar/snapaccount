using SnapAccount.Shared.Domain;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Domain.Events;

/// <summary>Raised when a new subscription is created.</summary>
public sealed record SubscriptionCreatedEvent(
    Guid SubscriptionId,
    Guid OrganizationId,
    Guid PlanId,
    SubscriptionStatus InitialStatus) : DomainEvent;
