using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Events;

/// <summary>
/// Published to snapaccount.document.ocr.completed Pub/Sub topic.
/// Subscribers: AccountingService, GstService
/// </summary>
public sealed record OcrCompletedEvent(Guid DocumentId, Guid UserId, Guid? OrganizationId) : DomainEvent;
