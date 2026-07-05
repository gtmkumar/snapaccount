using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

public class JournalEntryLine : BaseAuditableEntity
{
    public Guid JournalEntryId { get; private set; }
    public Guid AccountId { get; private set; }
    public int LineNumber { get; private set; }
    public string? Description { get; private set; }
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }
    public string Currency { get; private set; } = "INR";
    public decimal? GstRatePct { get; private set; }
    public string? HsnSacCode { get; private set; }
    public string? CostCenter { get; private set; }

    private JournalEntryLine() { }
}
