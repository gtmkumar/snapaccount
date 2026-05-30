using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

/// <summary>Published when a new org invitation is created. Triggers notification delivery.</summary>
public record InvitationCreatedEvent(
    Guid InvitationId,
    Guid OrganizationId,
    string Email,
    string? PhoneNumber,
    Guid RoleId,
    Guid InvitedByUserId,
    DateTime ExpiresAt) : DomainEvent;
