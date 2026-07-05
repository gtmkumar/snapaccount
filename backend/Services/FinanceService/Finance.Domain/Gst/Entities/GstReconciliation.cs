using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class GstReconciliation : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public string FinancialYear { get; private set; } = string.Empty;
    public int PeriodMonth { get; private set; }
    public string ReconciliationType { get; private set; } = string.Empty; // GSTR_2A, GSTR_2B
    public string Status { get; private set; } = "PENDING"; // PENDING, IN_PROGRESS, COMPLETED, FAILED
    public int TotalInvoices { get; private set; }
    public int MatchedCount { get; private set; }
    public int MismatchedCount { get; private set; }
    public int MissingCount { get; private set; }
    public decimal ItcAsPerBooks { get; private set; }
    public decimal ItcAsPerGstr { get; private set; }
    public DateTime? ReconciledAt { get; private set; }

    private GstReconciliation() { }

    public static GstReconciliation Create(Guid orgId, string financialYear, int periodMonth,
        string reconciliationType)
        => new()
        {
            OrganizationId = orgId,
            FinancialYear = financialYear,
            PeriodMonth = periodMonth,
            ReconciliationType = reconciliationType
        };

    public void Complete(int total, int matched, int mismatched, int missing,
        decimal booksItc, decimal gstrItc)
    {
        TotalInvoices = total;
        MatchedCount = matched;
        MismatchedCount = mismatched;
        MissingCount = missing;
        ItcAsPerBooks = booksItc;
        ItcAsPerGstr = gstrItc;
        Status = "COMPLETED";
        ReconciledAt = DateTime.UtcNow;
    }
}
