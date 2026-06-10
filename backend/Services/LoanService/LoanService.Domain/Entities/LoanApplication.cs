using LoanService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Loan application aggregate root.
/// Enforces the state machine: DRAFT → SUBMITTED → UNDER_REVIEW
///   → APPROVED | REJECTED | DOCS_REQUESTED → DISBURSED → CLOSED
///
/// P6-HANDOFF-28: every status transition MUST insert a status_log row in the same UoW.
/// </summary>
public class LoanApplication : BaseAuditableEntity
{
    /// <summary>Organisation that owns this application.</summary>
    public Guid OrgId { get; init; }

    /// <summary>User who created/submitted the application (nullable for DPDP anonymisation).</summary>
    public Guid? UserId { get; set; }

    /// <summary>FK to loan.loan_products.</summary>
    public Guid LoanProductId { get; init; }

    /// <summary>Requested disbursement amount in INR.</summary>
    public decimal RequestedAmount { get; set; }

    /// <summary>Requested tenure in months.</summary>
    public int TenureMonths { get; set; }

    /// <summary>Purpose description (e.g. "Working capital for monsoon inventory").</summary>
    public string? Purpose { get; set; }

    /// <summary>Current status — controlled exclusively via state machine methods.</summary>
    public LoanApplicationStatus Status { get; private set; } = LoanApplicationStatus.Draft;

    /// <summary>UTC timestamp when the application was submitted to a bank.</summary>
    public DateTime? SubmittedAt { get; private set; }

    /// <summary>Reference number assigned by the partner bank.</summary>
    public string? BankReferenceNo { get; private set; }

    /// <summary>UTC timestamp of disbursement.</summary>
    public DateTime? DisbursedAt { get; private set; }

    /// <summary>Actual disbursed amount in INR.</summary>
    public decimal? DisbursedAmount { get; private set; }

    /// <summary>Bank that was assigned to review this application.</summary>
    public Guid? AssignedBankId { get; private set; }

    /// <summary>DPDP anonymisation — set when user exercises right to erasure.</summary>
    public DateTime? AnonymizedAt { get; set; }

    /// <summary>DPDP anonymisation reason (e.g. 'DPDP_USER_ERASURE').</summary>
    public string? AnonymizationReason { get; set; }

    // ── GAP-021: RBI Digital Lending Guidelines — Cooling-off window ──────────

    /// <summary>
    /// UTC end of the cooling-off window after disbursement.
    /// Populated by <see cref="RecordDisbursement"/> based on the KFS <c>CoolingOffDays</c>.
    /// NULL until disbursed.
    /// </summary>
    public DateTime? CoolingOffEndsAt { get; set; }

    /// <summary>
    /// Number of cooling-off days granted (copied from the acknowledged KFS).
    /// NULL until disbursed.
    /// </summary>
    public int? CoolingOffDays { get; set; }

    // Navigation
    public LoanProduct? LoanProduct { get; set; }
    public PartnerBank? AssignedBank { get; set; }

    // ── State machine transitions ──────────────────────────────────────────────

    /// <summary>Submit a DRAFT application for review. Raises <see cref="LoanApplicationSubmittedEvent"/>.</summary>
    public Result Submit()
    {
        if (Status != LoanApplicationStatus.Draft)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot submit from status '{Status}'. Expected 'Draft'."));

        Status = LoanApplicationStatus.Submitted;
        SubmittedAt = DateTime.UtcNow;
        AddDomainEvent(new LoanApplicationSubmittedEvent(Id, OrgId));
        return Result.Success();
    }

    /// <summary>Mark application as under bank review.</summary>
    public Result BeginReview()
    {
        if (Status != LoanApplicationStatus.Submitted)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot begin review from status '{Status}'. Expected 'Submitted'."));

        Status = LoanApplicationStatus.UnderReview;
        return Result.Success();
    }

    /// <summary>Assign to a specific partner bank. Raises <see cref="LoanAssignedToBankEvent"/>.</summary>
    public Result AssignToBank(Guid bankId)
    {
        if (Status is not (LoanApplicationStatus.Submitted or LoanApplicationStatus.UnderReview))
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot assign bank from status '{Status}'."));

        AssignedBankId = bankId;
        Status = LoanApplicationStatus.UnderReview;
        AddDomainEvent(new LoanAssignedToBankEvent(Id, OrgId, bankId));
        return Result.Success();
    }

    /// <summary>Approve the application. Raises <see cref="LoanApprovedEvent"/>.</summary>
    public Result Approve(string bankReferenceNo)
    {
        if (Status != LoanApplicationStatus.UnderReview && Status != LoanApplicationStatus.DocsRequested)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot approve from status '{Status}'."));

        Status = LoanApplicationStatus.Approved;
        BankReferenceNo = bankReferenceNo;
        AddDomainEvent(new LoanApprovedEvent(Id, OrgId));
        return Result.Success();
    }

    /// <summary>Reject the application. Raises <see cref="LoanRejectedEvent"/>.</summary>
    public Result Reject(string reason)
    {
        if (Status != LoanApplicationStatus.UnderReview && Status != LoanApplicationStatus.DocsRequested)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot reject from status '{Status}'."));

        Status = LoanApplicationStatus.Rejected;
        AddDomainEvent(new LoanRejectedEvent(Id, OrgId, reason));
        return Result.Success();
    }

    /// <summary>Request additional documents from the applicant.</summary>
    public Result RequestDocuments()
    {
        if (Status != LoanApplicationStatus.UnderReview)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot request documents from status '{Status}'."));

        Status = LoanApplicationStatus.DocsRequested;
        return Result.Success();
    }

    /// <summary>Record disbursement. Raises <see cref="LoanDisbursedEvent"/>.</summary>
    public Result RecordDisbursement(decimal disbursedAmount, string bankReferenceNo)
    {
        if (Status != LoanApplicationStatus.Approved)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot record disbursement from status '{Status}'. Expected 'Approved'."));

        Status = LoanApplicationStatus.Disbursed;
        DisbursedAmount = disbursedAmount;
        DisbursedAt = DateTime.UtcNow;
        BankReferenceNo = bankReferenceNo;
        AddDomainEvent(new LoanDisbursedEvent(Id, OrgId, disbursedAmount));
        return Result.Success();
    }

    /// <summary>Record a failed disbursement. Raises <see cref="LoanDisbursementFailedEvent"/>.</summary>
    public Result RecordDisbursementFailed(string reason)
    {
        if (Status != LoanApplicationStatus.Approved)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot record disbursement failure from status '{Status}'."));

        AddDomainEvent(new LoanDisbursementFailedEvent(Id, OrgId, reason));
        return Result.Success();
    }

    /// <summary>Record a disbursement reversal. Raises <see cref="LoanDisbursementReversedEvent"/>.</summary>
    public Result RecordDisbursementReversed(string reason)
    {
        if (Status != LoanApplicationStatus.Disbursed)
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot record reversal from status '{Status}'. Expected 'Disbursed'."));

        Status = LoanApplicationStatus.Approved; // revert to approved pending re-disbursement
        AddDomainEvent(new LoanDisbursementReversedEvent(Id, OrgId, reason));
        return Result.Success();
    }

    /// <summary>Close a disbursed or rejected application.</summary>
    public Result Close()
    {
        if (Status is not (LoanApplicationStatus.Disbursed or LoanApplicationStatus.Rejected))
            return Result.Failure(Error.Conflict("LoanApplication.InvalidTransition",
                $"Cannot close from status '{Status}'. Expected 'Disbursed' or 'Rejected'."));

        Status = LoanApplicationStatus.Closed;
        return Result.Success();
    }
}

/// <summary>
/// Loan application status state machine.
/// DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED|REJECTED|DOCS_REQUESTED → DISBURSED → CLOSED
/// </summary>
public enum LoanApplicationStatus
{
    Draft,
    Submitted,
    UnderReview,
    DocsRequested,
    Approved,
    Rejected,
    Disbursed,
    Closed
}
