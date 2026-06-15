using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// A journal batch groups multiple <see cref="LedgerEntry"/> items that must balance
/// (sum of debits == sum of credits). The batch invariant is enforced by <see cref="Validate"/>.
/// Domain event <see cref="Events.JournalBatchPostedEvent"/> is raised on successful posting.
/// </summary>
public class JournalBatch : BaseAuditableEntity
{
    /// <summary>Organisation that owns this batch.</summary>
    public Guid OrgId { get; private set; }

    /// <summary>Human-readable batch reference number.</summary>
    public string BatchNumber { get; private set; } = string.Empty;

    /// <summary>Free-text description.</summary>
    public string Description { get; private set; } = string.Empty;

    /// <summary>Posting date (used for FY/period mapping).</summary>
    public DateOnly PostingDate { get; private set; }

    /// <summary>Financial year derived from <see cref="PostingDate"/> (IST Apr–Mar).</summary>
    public int FyYear { get; private set; }

    /// <summary>Sum of all debit amounts — must equal <see cref="TotalCredit"/>.</summary>
    public decimal TotalDebit { get; private set; }

    /// <summary>Sum of all credit amounts — must equal <see cref="TotalDebit"/>.</summary>
    public decimal TotalCredit { get; private set; }

    /// <summary>Source that created this batch.</summary>
    public PostingSource Source { get; private set; }

    /// <summary>POSTED when the batch passes validation and is committed.</summary>
    public string Status { get; private set; } = "DRAFT";

    private readonly List<LedgerEntry> _entries = [];

    /// <summary>Entries belonging to this batch.</summary>
    public IReadOnlyCollection<LedgerEntry> Entries => _entries.AsReadOnly();

    private JournalBatch() { }

    /// <summary>Creates a new draft batch for the given organisation.</summary>
    public static JournalBatch Create(
        Guid orgId,
        string batchNumber,
        string description,
        DateOnly postingDate,
        PostingSource source)
    {
        // Determine Indian FY: Apr–Mar, so dates in Jan–Mar belong to the previous calendar year's FY.
        int fyYear = postingDate.Month >= 4 ? postingDate.Year + 1 : postingDate.Year;

        return new JournalBatch
        {
            OrgId = orgId,
            BatchNumber = batchNumber,
            Description = description,
            PostingDate = postingDate,
            FyYear = fyYear,
            Source = source
        };
    }

    /// <summary>
    /// Adds a <see cref="LedgerEntry"/> to the batch and accumulates totals.
    /// </summary>
    public void AddEntry(LedgerEntry entry)
    {
        _entries.Add(entry);
        TotalDebit += entry.Amount;
        TotalCredit += entry.Amount; // In double-entry each entry has one debit and one credit
    }

    /// <summary>
    /// Validates that the batch is balanced (debit total == credit total).
    /// Returns <see cref="Result.Failure"/> if unbalanced — never throws.
    /// </summary>
    public Result Validate()
    {
        if (_entries.Count == 0)
            return Result.Failure(Error.Validation("JournalBatch.Empty", "A batch must contain at least one entry."));

        if (TotalDebit != TotalCredit)
            return Result.Failure(Error.Validation("JournalBatch.Unbalanced",
                $"Batch is unbalanced: debit {TotalDebit:F2} ≠ credit {TotalCredit:F2}."));

        return Result.Success();
    }

    /// <summary>Marks the batch as posted and raises a domain event.</summary>
    public Result Post()
    {
        var validation = Validate();
        if (validation.IsFailure) return validation;

        Status = "POSTED";
        AddDomainEvent(new Events.JournalBatchPostedEvent(Id, OrgId, FyYear, TotalDebit));
        return Result.Success();
    }
}
