using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>Raised when a thread is escalated.</summary>
public sealed record ThreadEscalatedEvent(
    Guid ThreadId,
    Guid OrganizationId,
    Guid EscalatedByUserId) : DomainEvent;
