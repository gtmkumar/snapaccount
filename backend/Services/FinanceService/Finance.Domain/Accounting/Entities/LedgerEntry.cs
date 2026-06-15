using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// Double-entry ledger entry in the <c>accounting.ledger_entries</c> table.
/// Each row represents one balanced posting; debit and credit accounts are explicit columns.
/// <para>P6-HANDOFF-03: <see cref="DedupeHash"/> = SHA-256(document_id || extracted_payload_hash)
/// enforces idempotency against Pub/Sub redeliveries via a partial unique index.</para>
/// </summary>
public class LedgerEntry : BaseAuditableEntity
{
    /// <summary>Organisation that owns this ledger entry (RLS column).</summary>
    public Guid OrgId { get; private set; }

    /// <summary>Source document (OCR) that generated this entry — nullable for manual entries.</summary>
    public Guid? DocumentId { get; private set; }

    /// <summary>Financial year (e.g., 2026 for FY2025-26, Apr–Mar IST boundary).</summary>
    public int FyYear { get; private set; }

    /// <summary>Accounting period month (1=April … 12=March in Indian FY).</summary>
    public int? PeriodMonth { get; private set; }

    /// <summary>GL account being debited.</summary>
    public Guid DebitAccountId { get; private set; }

    /// <summary>GL account being credited.</summary>
    public Guid CreditAccountId { get; private set; }

    /// <summary>Amount in INR. decimal — never float/double per compliance spec.</summary>
    public decimal Amount { get; private set; }

    /// <summary>Always INR as default currency.</summary>
    public string Currency { get; private set; } = "INR";

    /// <summary>Human-readable narration for audit trail.</summary>
    public string Narration { get; private set; } = string.Empty;

    /// <summary>Posting source — OCR, MANUAL, IMPORT, or SYSTEM.</summary>
    public PostingSource Source { get; private set; }

    /// <summary>Workflow status — PENDING_REVIEW, APPROVED, or REVERSED.</summary>
    public PostingStatus Status { get; private set; } = PostingStatus.PendingReview;

    /// <summary>Timestamp when the entry was posted (UTC; IST conversion at display layer).</summary>
    public DateTimeOffset PostedAt { get; private set; }

    /// <summary>Reviewer user ID when Status == APPROVED or REVERSED.</summary>
    public Guid? ReviewedBy { get; private set; }

    /// <summary>Timestamp of review action.</summary>
    public DateTimeOffset? ReviewedAt { get; private set; }

    /// <summary>
    /// SHA-256 of (document_id || extracted_payload_hash).
    /// NULL for non-OCR entries. Partial unique index (WHERE dedupe_hash IS NOT NULL)
    /// rejects duplicate Pub/Sub redeliveries. P6-HANDOFF-03.
    /// </summary>
    public string? DedupeHash { get; private set; }

    /// <summary>Owning batch identifier.</summary>
    public Guid? JournalBatchId { get; private set; }

    private LedgerEntry() { }

    /// <summary>Creates a new ledger entry.</summary>
    public static LedgerEntry Create(
        Guid orgId,
        Guid debitAccountId,
        Guid creditAccountId,
        decimal amount,
        string narration,
        int fyYear,
        int? periodMonth,
        PostingSource source,
        Guid? documentId = null,
        string? dedupeHash = null,
        Guid? journalBatchId = null)
    {
        return new LedgerEntry
        {
            OrgId = orgId,
            DebitAccountId = debitAccountId,
            CreditAccountId = creditAccountId,
            Amount = amount,
            Narration = narration,
            FyYear = fyYear,
            PeriodMonth = periodMonth,
            Source = source,
            DocumentId = documentId,
            DedupeHash = dedupeHash,
            PostedAt = DateTimeOffset.UtcNow,
            JournalBatchId = journalBatchId,
            Status = PostingStatus.PendingReview
        };
    }

    /// <summary>Approves a pending-review entry. Returns failure for invalid transitions.</summary>
    public Result Approve(Guid reviewerId)
    {
        if (Status != PostingStatus.PendingReview)
            return Result.Failure(Error.Conflict("LedgerEntry.InvalidTransition",
                $"Cannot approve entry with status {Status}."));

        Status = PostingStatus.Approved;
        ReviewedBy = reviewerId;
        ReviewedAt = DateTimeOffset.UtcNow;
        return Result.Success();
    }

    /// <summary>Reverses an approved entry. Returns failure for invalid transitions.</summary>
    public Result Reverse(Guid reviewerId)
    {
        if (Status != PostingStatus.Approved)
            return Result.Failure(Error.Conflict("LedgerEntry.InvalidTransition",
                $"Cannot reverse entry with status {Status}."));

        Status = PostingStatus.Reversed;
        ReviewedBy = reviewerId;
        ReviewedAt = DateTimeOffset.UtcNow;
        return Result.Success();
    }
}
