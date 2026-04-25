using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

public class JournalEntry : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? PeriodId { get; private set; }
    public string EntryNumber { get; private set; } = string.Empty;
    public DateOnly EntryDate { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public string EntryType { get; private set; } = "MANUAL";
    // MANUAL, AUTO_OCR, OPENING_BALANCE, CLOSING, ADJUSTMENT, REVERSAL
    public string? ReferenceType { get; private set; }
    public Guid? ReferenceId { get; private set; }
    public decimal TotalDebit { get; private set; }
    public decimal TotalCredit { get; private set; }
    public string Status { get; private set; } = "DRAFT"; // DRAFT, POSTED, REVERSED, VOID

    private readonly List<JournalEntryLine> _lines = [];
    public IReadOnlyCollection<JournalEntryLine> Lines => _lines.AsReadOnly();

    private JournalEntry() { }

    public static JournalEntry Create(Guid orgId, string entryNumber, DateOnly entryDate, string description, string entryType = "MANUAL")
        => new() { OrganizationId = orgId, EntryNumber = entryNumber, EntryDate = entryDate, Description = description, EntryType = entryType };
}
