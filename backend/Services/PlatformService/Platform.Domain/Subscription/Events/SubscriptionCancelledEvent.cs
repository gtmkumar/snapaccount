using SnapAccount.Shared.Domain;

namespace SubscriptionService.Domain.Events;

/// <summary>Raised when a subscription is cancelled.</summary>
public sealed record SubscriptionCancelledEvent(
    Guid SubscriptionId,
    Guid OrganizationId) : DomainEvent;
