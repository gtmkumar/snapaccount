namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Exposes configurable KFS (Key Facts Statement) parameters to the Application layer
/// without introducing a direct dependency on <c>Microsoft.Extensions.Configuration</c>.
/// Implemented in Infrastructure by reading <c>appsettings.json</c> / env vars.
/// </summary>
public interface ILoanKfsConfig
{
    /// <summary>Processing fee as a fraction of principal (default: 0.02 = 2%).</summary>
    decimal ProcessingFeeRate { get; }

    /// <summary>
    /// Grievance officer contact string displayed in the KFS (RBI mandate).
    /// Format: "Name | email | phone"
    /// </summary>
    string GrievanceOfficerContact { get; }

    /// <summary>Number of calendar days in the cooling-off window after disbursal (default: 3).</summary>
    int CoolingOffDays { get; }

    /// <summary>
    /// DG-LOAN-05: Structured grievance officer JSON (RBI mandate).
    /// Schema: { "name": "...", "phone": "...", "email": "...", "address": "...",
    ///           "hours": "...", "escalation": "RBI CMS (cms.rbi.org.in)" }
    /// Used to build the <c>GrievanceOfficerBlock</c> on the mobile KFS screen.
    /// </summary>
    string GrievanceOfficerJson { get; }

    /// <summary>
    /// DG-LOAN-05: Nominal annual interest rate (% p.a.) used in KFS generation.
    /// Distinct from APR (which includes all fees). Displayed in <c>AprHeroBlock</c>.
    /// Config key: Loan:NominalInterestRate. Default derived from the loan product.
    /// </summary>
    decimal NominalInterestRate { get; }

    /// <summary>
    /// DG-LOAN-05: Interest type label (e.g. "REDUCING_BALANCE", "FLAT_RATE").
    /// Config key: Loan:InterestType. Default: "REDUCING_BALANCE".
    /// </summary>
    string InterestType { get; }

    /// <summary>
    /// DG-LOAN-05: Locale-aware cooling-off plain-language terms (en/hi/bn).
    /// Returns the appropriate text for the given BCP-47 locale, falling back to "en".
    /// RBI requires this be stated on the KFS in a language the borrower understands.
    /// </summary>
    /// <param name="locale">BCP-47 locale tag (e.g. "en", "hi", "bn").</param>
    /// <param name="coolingOffDays">Days in the cooling-off window (parameterised for accuracy).</param>
    string GetCoolingOffTerms(string locale, int coolingOffDays);
}
