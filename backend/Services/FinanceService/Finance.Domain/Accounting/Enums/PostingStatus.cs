namespace AccountingService.Domain.Entities;

/// <summary>Lifecycle status of a ledger entry.</summary>
public enum PostingStatus
{
    /// <summary>Auto-posted from OCR; awaiting CA/admin review.</summary>
    PendingReview,
    /// <summary>Reviewed and accepted into the books.</summary>
    Approved,
    /// <summary>Reversed by a journal reversal entry.</summary>
    Reversed
}
