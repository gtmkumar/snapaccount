using ChatService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>Raised when a new support thread is opened.</summary>
public sealed record ThreadOpenedEvent(
    Guid ThreadId,
    Guid OrganizationId,
    Guid InitiatedByUserId,
    ThreadCategory Category) : DomainEvent;
