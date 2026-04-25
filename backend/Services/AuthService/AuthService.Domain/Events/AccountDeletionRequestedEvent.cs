using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

/// <summary>
/// Fired when a user requests account deletion under DPDP Act 2023 Right to Erasure.
/// Notification service will send confirmation. Auth service will hard-delete after 30-day grace period.
/// </summary>
public sealed record AccountDeletionRequestedEvent(Guid UserId, string PhoneNumber) : DomainEvent;
