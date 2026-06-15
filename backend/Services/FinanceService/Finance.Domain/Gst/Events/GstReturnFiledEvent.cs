using SnapAccount.Shared.Domain;

namespace GstService.Domain.Events;

/// <summary>
/// Published to snapaccount.gst.return.filed Pub/Sub topic.
/// Subscriber: NotificationService (sends confirmation to user)
/// </summary>
public sealed record GstReturnFiledEvent(
    Guid GstReturnId,
    Guid OrganizationId,
    string Gstin,
    string ReturnType,
    string FinancialYear,
    int? PeriodMonth) : DomainEvent;
