using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Events;

/// <summary>
/// Raised when a <see cref="Entities.JournalBatch"/> passes validation and is posted
/// to the ledger. Downstream handlers may trigger dashboard refresh or GST linkage.
/// </summary>
public sealed record JournalBatchPostedEvent(
    Guid BatchId,
    Guid OrgId,
    int FyYear,
    decimal TotalAmount) : DomainEvent;
