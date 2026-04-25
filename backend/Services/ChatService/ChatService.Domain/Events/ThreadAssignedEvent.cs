using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>Raised when a thread is assigned to an agent or CA.</summary>
public sealed record ThreadAssignedEvent(
    Guid ThreadId,
    Guid OrganizationId,
    Guid AssignedToUserId) : DomainEvent;
