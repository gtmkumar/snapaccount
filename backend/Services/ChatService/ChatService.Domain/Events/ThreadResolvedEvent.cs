using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>Raised when a thread is marked resolved.</summary>
public sealed record ThreadResolvedEvent(
    Guid ThreadId,
    Guid OrganizationId,
    Guid ResolvedByUserId) : DomainEvent;
