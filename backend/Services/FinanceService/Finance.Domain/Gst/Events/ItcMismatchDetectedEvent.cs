using SnapAccount.Shared.Domain;

namespace GstService.Domain.Events;

public sealed record ItcMismatchDetectedEvent(
    Guid ItcMismatchId,
    Guid OrganizationId,
    string MismatchType,
    decimal DifferenceAmount) : DomainEvent;
