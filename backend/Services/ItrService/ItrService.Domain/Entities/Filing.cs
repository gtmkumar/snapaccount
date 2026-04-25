using ItrService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// An ITR filing for a specific assessment year.
/// State machine: DRAFT → UNDER_CA_REVIEW → USER_APPROVED → FILED → E_VERIFIED → REFUND_ISSUED
/// Side transitions: REJECTED_BY_CA, NOTICE_RECEIVED.
/// P6-HANDOFF-20: itr_v_uri is NEVER persisted — always regenerated from itr_v_object_key on demand.
/// </summary>
public class Filing : BaseAuditableEntity
{
    /// <summary>The assessee this filing belongs to.</summary>
    public Guid AssesseeId { get; private set; }

    /// <summary>Assessment Year in format "AY2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    /// <summary>
    /// ITR form type: ITR-1, ITR-2, ITR-3, ITR-4, ITR-5, ITR-6, ITR-7.
    /// Determined by income sources and assessee type.
    /// </summary>
    public string ItrFormType { get; private set; } = "ITR-1";

    /// <summary>Regime choice: OLD or NEW.</summary>
    public string Regime { get; private set; } = "NEW";

    /// <summary>
    /// Current filing status.
    /// DRAFT | UNDER_CA_REVIEW | USER_APPROVED | FILED | E_VERIFIED | REFUND_ISSUED | REJECTED_BY_CA | NOTICE_RECEIVED
    /// </summary>
    public string Status { get; private set; } = "DRAFT";

    // ── Tax computation pinned fields (P6-HANDOFF-18) ──────────────────────

    /// <summary>Pinned tax slab version used for this filing's computation.</summary>
    public Guid? TaxSlabVersionId { get; private set; }

    /// <summary>Canonical computation result JSON (immutable audit/replay invariant).</summary>
    public string? ComputationJsonb { get; private set; }

    /// <summary>SHA-256 hash of the computation inputs (SEC-020).</summary>
    public string? ComputationHash { get; private set; }

    // ── Income heads ──────────────────────────────────────────────────────────

    /// <summary>Gross salary income (INR).</summary>
    public decimal SalaryIncome { get; private set; }

    /// <summary>House property income/loss (INR).</summary>
    public decimal HousePropertyIncome { get; private set; }

    /// <summary>Business/professional income (INR).</summary>
    public decimal BusinessIncome { get; private set; }

    /// <summary>Capital gains (INR).</summary>
    public decimal CapitalGains { get; private set; }

    /// <summary>Other sources income (INR).</summary>
    public decimal OtherIncome { get; private set; }

    // ── Deductions ────────────────────────────────────────────────────────────

    /// <summary>Total Chapter VI-A deductions (INR).</summary>
    public decimal TotalDeductions { get; private set; }

    // ── Filing metadata ───────────────────────────────────────────────────────

    /// <summary>CA user who reviewed this filing.</summary>
    public Guid? ReviewedByCaId { get; private set; }

    /// <summary>Reason given by CA if rejected.</summary>
    public string? CaRejectionReason { get; private set; }

    /// <summary>ITR-V PDF GCS object key (NOT a signed URL — P6-HANDOFF-20).</summary>
    public string? ItrVObjectKey { get; private set; }

    /// <summary>E-verification method: ITR_V_UPLOAD, EVC, AADHAAR_OTP, BANK_ATM.</summary>
    public string? EVerificationMethod { get; private set; }

    /// <summary>Acknowledgement number from IT department after filing.</summary>
    public string? AcknowledgementNumber { get; private set; }

    /// <summary>Filing date and time.</summary>
    public DateTime? FiledAt { get; private set; }

    /// <summary>E-verification date and time.</summary>
    public DateTime? EVerifiedAt { get; private set; }

    /// <summary>DPDP anonymization.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>Reason for anonymization.</summary>
    public string? AnonymizationReason { get; private set; }

    private Filing() { }

    /// <summary>Creates a new filing in DRAFT status.</summary>
    public static Filing Create(Guid assesseeId, string assessmentYear, string itrFormType, string regime)
    {
        return new Filing
        {
            AssesseeId = assesseeId,
            AssessmentYear = assessmentYear,
            ItrFormType = itrFormType,
            Regime = regime
        };
    }

    /// <summary>Updates income heads.</summary>
    public void UpdateIncomeHeads(
        decimal salary, decimal houseProperty, decimal business, decimal capitalGains, decimal other)
    {
        SalaryIncome = salary;
        HousePropertyIncome = houseProperty;
        BusinessIncome = business;
        CapitalGains = capitalGains;
        OtherIncome = other;
    }

    /// <summary>Updates total deductions.</summary>
    public void UpdateDeductions(decimal totalDeductions) => TotalDeductions = totalDeductions;

    /// <summary>
    /// Pins the tax computation result (P6-HANDOFF-18 audit invariant).
    /// Immutable once set — a new filing must be created for recomputation.
    /// </summary>
    public void PinComputation(Guid taxSlabVersionId, string computationJsonb, string computationHash)
    {
        TaxSlabVersionId = taxSlabVersionId;
        ComputationJsonb = computationJsonb;
        ComputationHash = computationHash;
        AddDomainEvent(new TaxComputationCompletedEvent(Id, AssesseeId, AssessmentYear, Regime));
    }

    /// <summary>Submits the filing for CA review.</summary>
    public Result SubmitForCaReview()
    {
        if (Status != "DRAFT")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot submit from '{Status}'."));
        if (TaxSlabVersionId is null)
            return Result.Failure(Error.Conflict("Filing.NoComputation", "Tax computation must be run before submission."));
        Status = "UNDER_CA_REVIEW";
        return Result.Success();
    }

    /// <summary>CA approves the filing.</summary>
    public Result ApproveByCa(Guid caId)
    {
        if (Status != "UNDER_CA_REVIEW")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot approve from '{Status}'."));
        Status = "USER_APPROVED";
        ReviewedByCaId = caId;
        return Result.Success();
    }

    /// <summary>CA rejects the filing — sends it back to DRAFT.</summary>
    public Result RejectByCa(Guid caId, string reason)
    {
        if (Status != "UNDER_CA_REVIEW")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot reject from '{Status}'."));
        Status = "REJECTED_BY_CA";
        ReviewedByCaId = caId;
        CaRejectionReason = reason;
        return Result.Success();
    }

    /// <summary>User approves the CA-reviewed filing for submission.</summary>
    public Result ApproveByUser()
    {
        if (Status != "USER_APPROVED")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot user-approve from '{Status}'."));
        // Status stays USER_APPROVED until filed
        return Result.Success();
    }

    /// <summary>Marks the filing as filed with the IT department.</summary>
    public Result MarkFiled(string acknowledgementNumber)
    {
        if (Status != "USER_APPROVED")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot file from '{Status}'."));
        Status = "FILED";
        AcknowledgementNumber = acknowledgementNumber;
        FiledAt = DateTime.UtcNow;
        AddDomainEvent(new FilingFiledEvent(Id, AssesseeId, AssessmentYear, acknowledgementNumber));
        return Result.Success();
    }

    /// <summary>Marks the filing as e-verified.</summary>
    public Result MarkEVerified(string method)
    {
        if (Status != "FILED")
            return Result.Failure(Error.Conflict("Filing.InvalidState", $"Cannot e-verify from '{Status}'."));
        Status = "E_VERIFIED";
        EVerificationMethod = method;
        EVerifiedAt = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Sets the ITR-V GCS object key (NOT a signed URL — P6-HANDOFF-20).</summary>
    public void SetItrVObjectKey(string objectKey) => ItrVObjectKey = objectKey;

    /// <summary>Records a notice received against this filing.</summary>
    public void MarkNoticeReceived() => Status = "NOTICE_RECEIVED";

    /// <summary>Marks refund as issued.</summary>
    public void MarkRefundIssued()
    {
        if (Status is "E_VERIFIED" or "FILED")
        {
            Status = "REFUND_ISSUED";
            AddDomainEvent(new RefundIssuedEvent(Id, AssesseeId, AssessmentYear));
        }
    }

    /// <summary>DPDP Act 2023: anonymize PII in this filing.</summary>
    public void Anonymize(string reason)
    {
        ComputationJsonb = null; // contains income figures
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
