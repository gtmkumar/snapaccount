using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Events;

public sealed record OtpVerifiedEvent(Guid UserId, string PhoneNumber, string OtpType) : DomainEvent;
