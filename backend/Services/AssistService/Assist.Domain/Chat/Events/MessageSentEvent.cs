using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Events;

/// <summary>Raised when a message is sent in a thread.</summary>
public sealed record MessageSentEvent(
    Guid MessageId,
    Guid ThreadId,
    Guid SenderUserId,
    string Body) : DomainEvent;
