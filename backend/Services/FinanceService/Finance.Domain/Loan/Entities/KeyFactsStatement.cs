using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// RBI Digital Lending Guidelines 2022 — Key Facts Statement (KFS).
///
/// A KFS MUST be served to the borrower BEFORE they consent to a loan.
/// It is immutable once generated; the borrower acknowledges it by referencing
/// its <see cref="Id"/> in the consent submission.
///
/// The entire statement payload is HMAC-SHA256 signed so its integrity can be
/// verified during consent validation and audit.
/// </summary>
public class KeyFactsStatement : BaseAuditableEntity
{
    /// <summary>FK to <c>loan.loan_application</c>.</summary>
    public Guid ApplicationId { get; private set; }

    // ── Core KFS fields (RBI DL Guidelines §5) ────────────────────────────────

    /// <summary>Annual Percentage Rate (%), inclusive of all fees, as a decimal (e.g. 18.50).</summary>
    public decimal AnnualPercentageRate { get; private set; }

    /// <summary>Loan amount in INR.</summary>
    public decimal LoanAmount { get; private set; }

    /// <summary>Loan tenure in months.</summary>
    public int TenureMonths { get; private set; }

    /// <summary>Monthly EMI in INR.</summary>
    public decimal MonthlyEmi { get; private set; }

    /// <summary>
    /// JSON-serialised fee itemisation.
    /// Schema: [{ "name": "Processing Fee", "amount": 500.00, "type": "one_time" }]
    /// </summary>
    public string FeesJson { get; private set; } = "[]";

    /// <summary>
    /// JSON-serialised repayment schedule.
    /// Schema: [{ "emiNumber": 1, "dueDate": "2026-07-10", "principal": 5000, "interest": 750, "total": 5750 }]
    /// </summary>
    public string RepaymentScheduleJson { get; private set; } = "[]";

    /// <summary>Name of the lender (partner bank / NBFC).</summary>
    public string LenderName { get; private set; } = string.Empty;

    /// <summary>Grievance-officer contact (name, email, phone) — config-driven.</summary>
    public string GrievanceOfficerContact { get; private set; } = string.Empty;

    /// <summary>
    /// Cooling-off period in calendar days (RBI minimum = 3).
    /// The borrower may cancel within this window after disbursement.
    /// </summary>
    public int CoolingOffDays { get; private set; }

    // ── Integrity ──────────────────────────────────────────────────────────────

    /// <summary>HMAC-SHA256 signature over the canonical KFS payload (base64-url).</summary>
    public string HmacSignature { get; private set; } = string.Empty;

    /// <summary>UTC timestamp when this KFS was generated.</summary>
    public DateTime GeneratedAt { get; private set; }

    /// <summary>UTC timestamp when the borrower acknowledged this KFS. NULL until acknowledged.</summary>
    public DateTime? AcknowledgedAt { get; private set; }

    /// <summary>
    /// BCP-47 locale tag for this KFS version (e.g. "en", "hi", "bn").
    /// NEW-D10: stored so GET /kfs can serve the locale variant the borrower originally saw.
    /// Immutable after generation — protected by the DB trigger fn_kfs_immutable_signed_fields.
    /// </summary>
    public string Locale { get; private set; } = "en";

    private KeyFactsStatement() { }

    /// <summary>Creates and signs a new Key Facts Statement.</summary>
    public static KeyFactsStatement Create(
        Guid applicationId,
        decimal loanAmount,
        int tenureMonths,
        decimal annualPercentageRate,
        decimal monthlyEmi,
        string feesJson,
        string repaymentScheduleJson,
        string lenderName,
        string grievanceOfficerContact,
        int coolingOffDays,
        string hmacSignature,
        string locale = "en")
        => new()
        {
            ApplicationId = applicationId,
            LoanAmount = loanAmount,
            TenureMonths = tenureMonths,
            AnnualPercentageRate = annualPercentageRate,
            MonthlyEmi = monthlyEmi,
            FeesJson = feesJson,
            RepaymentScheduleJson = repaymentScheduleJson,
            LenderName = lenderName,
            GrievanceOfficerContact = grievanceOfficerContact,
            CoolingOffDays = coolingOffDays,
            HmacSignature = hmacSignature,
            Locale = string.IsNullOrWhiteSpace(locale) ? "en" : locale.Trim().ToLowerInvariant(),
            GeneratedAt = DateTime.UtcNow,
        };

    /// <summary>
    /// Records that the borrower has acknowledged this KFS.
    /// Called by the consent submission pipeline when the KFS id is validated.
    /// </summary>
    public void RecordAcknowledgement()
        => AcknowledgedAt = DateTime.UtcNow;
}
