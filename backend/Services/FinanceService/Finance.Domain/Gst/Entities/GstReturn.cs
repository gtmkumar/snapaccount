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

    // Filing queue — denormalised for the admin CA assignment queue
    /// <summary>Snapshot of the business/org name at the time the return was created.</summary>
    public string? BusinessNameSnapshot { get; private set; }

    /// <summary>CA user assigned to handle this return. FK → auth.user.id.</summary>
    public Guid? AssignedCaUserId { get; private set; }

    /// <summary>SLA deadline for this filing to be completed.</summary>
    public DateTime? SlaExpiresAt { get; private set; }

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

    /// <summary>
    /// Sets the computed late fee and interest amounts before or during filing.
    /// DG-GST-04: called by <c>FileReturnCommandHandler</c> after penalty calculation.
    /// Amounts are always non-negative; call with zero when filing on time.
    /// </summary>
    /// <param name="lateFeeAmount">Total late fee in INR (per-day * days-late, capped).</param>
    /// <param name="interestAmount">Interest on net tax payable in INR (Section 50, 18% p.a.).</param>
    public Result SetPenalties(decimal lateFeeAmount, decimal interestAmount)
    {
        if (lateFeeAmount < 0)
            return Result.Failure(Error.Validation("GstReturn.InvalidLateFee",
                "Late fee amount cannot be negative."));
        if (interestAmount < 0)
            return Result.Failure(Error.Validation("GstReturn.InvalidInterest",
                "Interest amount cannot be negative."));

        LateFeeAmount = lateFeeAmount;
        InterestAmount = interestAmount;
        return Result.Success();
    }

    /// <summary>
    /// Assigns a CA user to handle this return in the filing queue.
    /// </summary>
    /// <param name="caUserId">The user ID of the CA being assigned.</param>
    public void AssignCa(Guid caUserId) => AssignedCaUserId = caUserId;

    /// <summary>
    /// Updates the ARN after the return has already been filed.
    /// Used when the ARN is received from the portal after an async filing,
    /// or when an admin corrects a typo in the ARN.
    /// DG-GST-02: ARN capture — PATCH /gst/returns/{id}/arn.
    /// </summary>
    /// <param name="arnNumber">The new Application Reference Number from the GST portal.</param>
    public Result UpdateArn(string arnNumber)
    {
        if (string.IsNullOrWhiteSpace(arnNumber))
            return Result.Failure(Error.Validation("GstReturn.ArnRequired", "ARN cannot be empty."));

        if (Status != "FILED")
            return Result.Failure(Error.Conflict("GstReturn.InvalidState",
                $"Cannot update ARN when return status is '{Status}'. Return must be in FILED state."));

        ArnNumber = arnNumber;
        return Result.Success();
    }
}
