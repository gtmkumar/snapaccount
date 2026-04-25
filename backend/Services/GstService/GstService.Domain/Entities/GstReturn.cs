using SnapAccount.Shared.Domain;
using GstService.Domain.Events;

namespace GstService.Domain.Entities;

/// <summary>
/// GST Return — enforces state machine: DRAFT → PENDING_APPROVAL → APPROVED → FILED → REVISION_NEEDED
/// </summary>
public class GstReturn : BaseAuditableEntity
{
    public Guid OrganizationId { get; init; }
    public string ReturnType { get; init; } = string.Empty; // GSTR-1, GSTR-3B, GSTR-9, GSTR-2A, GSTR-2B
    public string FinancialYear { get; init; } = string.Empty; // e.g. '2024-25'
    public int? PeriodMonth { get; init; } // 1-12
    public int? PeriodQuarter { get; init; } // 1-4
    public string Gstin { get; init; } = string.Empty;
    public string Status { get; private set; } = "DRAFT";
    // DRAFT, PENDING_APPROVAL, APPROVED, FILED, REVISION_NEEDED, AMENDED

    // Computed amounts — always decimal, never float/double
    public decimal TotalTaxableValue { get; private set; }
    public decimal TotalIgst { get; private set; }
    public decimal TotalCgst { get; private set; }
    public decimal TotalSgst { get; private set; }
    public decimal TotalCess { get; private set; }
    public decimal TotalItcAvailable { get; private set; }
    public decimal NetTaxPayable { get; private set; }
    public decimal LateFeeAmount { get; private set; }
    public decimal InterestAmount { get; private set; }

    // Filing
    public DateOnly? FilingDeadline { get; init; }
    public DateTime? SubmittedAt { get; private set; }
    public Guid? SubmittedBy { get; private set; }
    public string? ArnNumber { get; private set; }
    public DateTime? FiledAt { get; private set; }

    // Approval
    public Guid? ApprovedBy { get; private set; }
    public DateTime? ApprovedAt { get; private set; }
    public string? RejectionReason { get; private set; }

    private readonly List<GstReturnLineItem> _lineItems = [];
    public IReadOnlyCollection<GstReturnLineItem> LineItems => _lineItems.AsReadOnly();

    // State machine transitions
    public Result SubmitForApproval(Guid submittedBy)
    {
        if (Status != "DRAFT")
            return Result.Failure(Error.Conflict("GstReturn.InvalidState",
                $"Cannot submit for approval from status '{Status}'. Expected 'DRAFT'."));

        Status = "PENDING_APPROVAL";
        SubmittedAt = DateTime.UtcNow;
        SubmittedBy = submittedBy;
        return Result.Success();
    }

    public Result Approve(Guid approvedBy)
    {
        if (Status != "PENDING_APPROVAL")
            return Result.Failure(Error.Conflict("GstReturn.InvalidState",
                $"Cannot approve from status '{Status}'. Expected 'PENDING_APPROVAL'."));

        Status = "APPROVED";
        ApprovedBy = approvedBy;
        ApprovedAt = DateTime.UtcNow;
        return Result.Success();
    }

    public Result File(string arnNumber)
    {
        if (Status != "APPROVED")
            return Result.Failure(Error.Conflict("GstReturn.InvalidState",
                $"Cannot file from status '{Status}'. Expected 'APPROVED'."));

        Status = "FILED";
        ArnNumber = arnNumber;
        FiledAt = DateTime.UtcNow;
        AddDomainEvent(new GstReturnFiledEvent(Id, OrganizationId, Gstin, ReturnType, FinancialYear, PeriodMonth));
        return Result.Success();
    }

    public Result RequestRevision(string reason)
    {
        if (Status != "PENDING_APPROVAL" && Status != "APPROVED")
            return Result.Failure(Error.Conflict("GstReturn.InvalidState",
                "Can only request revision from PENDING_APPROVAL or APPROVED."));

        Status = "REVISION_NEEDED";
        RejectionReason = reason;
        return Result.Success();
    }

    public void UpdateTotals(
        decimal taxableValue, decimal igst, decimal cgst, decimal sgst, decimal cess,
        decimal itcAvailable, decimal netTaxPayable)
    {
        TotalTaxableValue = taxableValue;
        TotalIgst = igst;
        TotalCgst = cgst;
        TotalSgst = sgst;
        TotalCess = cess;
        TotalItcAvailable = itcAvailable;
        NetTaxPayable = netTaxPayable;
    }

    public GstReturnLineItem AddLineItem(string lineType, string? hsnSacCode, decimal taxableValue,
        decimal igst, decimal cgst, decimal sgst, decimal cess, decimal? gstRatePct)
    {
        var item = GstReturnLineItem.Create(Id, lineType, hsnSacCode, taxableValue, igst, cgst, sgst, cess, gstRatePct);
        _lineItems.Add(item);
        return item;
    }
}
