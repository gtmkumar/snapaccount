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
    /// DG-LOAN-05: Structured grievance officer object (JSON).
    /// Schema: { name, phone, email, address, hours, escalation }
    /// Supercedes the flat <see cref="GrievanceOfficerContact"/> for new KFS records;
    /// old records retain the flat string. Immutable once signed.
    /// </summary>
    public string? GrievanceOfficerJson { get; private set; }

    /// <summary>
    /// Cooling-off period in calendar days (RBI minimum = 3).
    /// The borrower may cancel within this window after disbursement.
    /// </summary>
    public int CoolingOffDays { get; private set; }

    // ── DG-LOAN-05: Extended RBI KFS disclosure fields ─────────────────────────

    /// <summary>
    /// Nominal annual interest rate (% p.a.) before fees.
    /// Displayed alongside APR in the <c>AprHeroBlock</c> caption.
    /// </summary>
    public decimal? NominalInterestRate { get; private set; }

    /// <summary>Interest calculation type (e.g. REDUCING_BALANCE, FLAT_RATE).</summary>
    public string? InterestType { get; private set; }

    /// <summary>
    /// Sum of all fee amounts from <see cref="FeesJson"/> (INR).
    /// Pre-computed at generation time for display in <c>FeeItemizationTable</c>.
    /// </summary>
    public decimal? TotalFees { get; private set; }

    /// <summary>
    /// Net amount credited to the borrower's account = <see cref="LoanAmount"/> − <see cref="TotalFees"/>.
    /// RBI mandatory disclosure in <c>NetDisbursalBlock</c>.
    /// </summary>
    public decimal? NetDisbursalAmount { get; private set; }

    /// <summary>
    /// Total outflow over the loan life = <see cref="MonthlyEmi"/> × <see cref="TenureMonths"/>.
    /// RBI mandatory disclosure in <c>LoanSnapshotGrid</c>.
    /// </summary>
    public decimal? TotalAmountPayable { get; private set; }

    /// <summary>
    /// Locale-specific plain-language cooling-off explanation text.
    /// e.g. "You may exit this loan within 3 days of disbursal by repaying the principal
    /// + proportionate APR, with no prepayment penalty."
    /// Versioned and immutable once signed.
    /// </summary>
    public string? CoolingOffTerms { get; private set; }

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
        string locale = "en",
        // DG-LOAN-05: extended RBI KFS disclosure fields
        decimal? nominalInterestRate = null,
        string? interestType = null,
        decimal? totalFees = null,
        decimal? netDisbursalAmount = null,
        decimal? totalAmountPayable = null,
        string? coolingOffTerms = null,
        string? grievanceOfficerJson = null)
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
            // DG-LOAN-05
            NominalInterestRate = nominalInterestRate,
            InterestType = interestType,
            TotalFees = totalFees,
            NetDisbursalAmount = netDisbursalAmount,
            TotalAmountPayable = totalAmountPayable,
            CoolingOffTerms = coolingOffTerms,
            GrievanceOfficerJson = grievanceOfficerJson,
        };

    /// <summary>
    /// Records that the borrower has acknowledged this KFS.
    /// Called by the consent submission pipeline when the KFS id is validated.
    /// </summary>
    public void RecordAcknowledgement()
        => AcknowledgedAt = DateTime.UtcNow;
}
