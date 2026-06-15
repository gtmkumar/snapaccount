using CallbackService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace CallbackService.Domain.Events;

/// <summary>Raised when a new callback is requested.</summary>
public record CallbackRequestedEvent(Guid CallbackId, Guid UserId, CallbackCategory Category) : DomainEvent;

/// <summary>Raised when an agent is assigned to a callback.</summary>
public record CallbackAssignedEvent(Guid CallbackId, Guid AgentId) : DomainEvent;

/// <summary>Raised when a callback is confirmed for a scheduled time.</summary>
public record CallbackConfirmedEvent(Guid CallbackId, DateTime ScheduledAt) : DomainEvent;

/// <summary>Raised when a callback call is completed.</summary>
public record CallbackCompletedEvent(Guid CallbackId, Guid AgentId, string? ResolutionSummary) : DomainEvent;

/// <summary>Raised when a callback is escalated.</summary>
public record CallbackEscalatedEvent(Guid CallbackId, string Reason) : DomainEvent;

/// <summary>Raised when a callback is cancelled.</summary>
public record CallbackCancelledEvent(Guid CallbackId, string? Reason) : DomainEvent;
