using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Events;

/// <summary>
/// Raised when an operator approves a reviewed document.
/// Published to <c>snapaccount.document.ocr.completed</c> Pub/Sub topic
/// so AccountingService can post the journal entry via its existing
/// <c>OcrResultSubscriber</c> / <c>PostFromOcrCommand</c> pipeline.
///
/// The payload shape matches <c>OcrCompletedPayload</c> consumed by AccountingService
/// (see AccountingService.Infrastructure.Messaging.OcrResultSubscriber).
/// </summary>
public sealed record DocumentApprovedEvent(
    Guid DocumentId,
    Guid UserId,
    Guid? OrganizationId,
    Guid ApprovedBy,
    decimal TotalAmount,
    string? VendorName,
    DateOnly DocumentDate) : DomainEvent;
