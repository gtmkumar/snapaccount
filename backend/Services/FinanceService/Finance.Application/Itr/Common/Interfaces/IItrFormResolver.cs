using SnapAccount.Shared.Domain;

namespace ItrService.Application.Common.Interfaces;

/// <summary>
/// Derives the appropriate ITR form type (ITR-1 through ITR-4) from the
/// assessee's income heads and assessee type, per Indian Income Tax rules.
/// Rules are config-driven and versioned by assessment year.
///
/// DG-ITR-10: replaces the caller-supplied-only approach with server-side determination.
/// </summary>
public interface IItrFormResolver
{
    /// <summary>
    /// Determines the most appropriate ITR form for the given income profile.
    /// Returns ITR-1, ITR-2, ITR-3, or ITR-4 within the automatically-determinable scope.
    /// ITR-5, ITR-6, ITR-7 are outside this scope (entities/trusts) and must be caller-supplied.
    /// </summary>
    /// <param name="request">Income and assessee profile inputs for determination.</param>
    /// <param name="assessmentYear">Assessment year e.g. "AY2025-26" — rules may differ by AY.</param>
    /// <returns>A <see cref="ItrFormSuggestion"/> with the recommended form and the reasons.</returns>
    ItrFormSuggestion DetermineForm(ItrFormResolverRequest request, string assessmentYear);

    /// <summary>
    /// Validates whether a caller-supplied <paramref name="callerForm"/> is consistent with
    /// the income profile. Returns warnings when the form is sub-optimal but does not block.
    /// Returns a Failure result when the form is clearly ineligible per IT rules.
    /// </summary>
    Result<ItrFormValidation> ValidateCallerForm(
        string callerForm,
        ItrFormResolverRequest request,
        string assessmentYear);
}

/// <summary>
/// Input parameters for ITR form determination.
/// All income fields are in INR (decimal); zero is a valid value.
/// </summary>
/// <param name="AssesseeType">
/// Domain assessee type: INDIVIDUAL, HUF, FIRM, COMPANY, AOP, BOI, AJP.
/// Non-INDIVIDUAL/HUF types fall outside ITR-1..4 scope.
/// </param>
/// <param name="SalaryIncome">Gross salary income.</param>
/// <param name="HousePropertyIncome">
/// House property income (positive = rental, negative = loss).
/// Multiple properties (i.e. more than one let-out) flag ITR-2+.
/// </param>
/// <param name="BusinessIncome">Business or professional income.</param>
/// <param name="CapitalGains">Capital gains (STCG + LTCG combined).</param>
/// <param name="OtherIncome">Income from other sources.</param>
/// <param name="TotalIncome">
/// Total gross income (sum of all heads before deductions).
/// Used for the ₹50 lakh threshold check for ITR-1/4.
/// </param>
/// <param name="HasMultipleHouseProperties">
/// Explicit flag for multiple house properties — triggers ITR-2 when true even if
/// <paramref name="HousePropertyIncome"/> is zero (one property may be nil-assessed).
/// </param>
/// <param name="IsPresumptiveTaxation">
/// True when the assessee opts for presumptive taxation (Section 44AD/44AE/44ADA).
/// Determines eligibility for ITR-4 vs ITR-3.
/// </param>
/// <param name="HasForeignAssets">
/// True when the assessee holds foreign assets or has foreign income — mandates ITR-2 or ITR-3.
/// </param>
/// <param name="AnnualTurnoverCr">
/// Annual turnover in crore (for business assessees).
/// Presumptive taxation (ITR-4) is only available when turnover ≤ ₹2Cr (Sec 44AD) or ₹50L (Sec 44ADA).
/// </param>
public record ItrFormResolverRequest(
    string AssesseeType,
    decimal SalaryIncome,
    decimal HousePropertyIncome,
    decimal BusinessIncome,
    decimal CapitalGains,
    decimal OtherIncome,
    decimal TotalIncome,
    bool HasMultipleHouseProperties = false,
    bool IsPresumptiveTaxation = false,
    bool HasForeignAssets = false,
    decimal? AnnualTurnoverCr = null);

/// <summary>
/// Suggested ITR form and rationale from the resolver.
/// </summary>
/// <param name="SuggestedForm">Recommended ITR form, e.g. "ITR-2".</param>
/// <param name="Reasons">
/// Human-readable list of income rules that drove the decision.
/// Config-driven; localised downstream via <c>IStringLocalizer</c>.
/// </param>
/// <param name="IsOutsideAutoScope">
/// True when the assessee type is non-individual/HUF (ITR-5/6/7 territory).
/// In that case <see cref="SuggestedForm"/> is null and the caller must supply the form.
/// </param>
public record ItrFormSuggestion(
    string? SuggestedForm,
    IReadOnlyList<string> Reasons,
    bool IsOutsideAutoScope);

/// <summary>
/// Validation result for a caller-supplied ITR form.
/// </summary>
/// <param name="CallerForm">The form as supplied by the caller.</param>
/// <param name="IsEligible">True if the caller form is valid per IT rules.</param>
/// <param name="SuggestedForm">The resolver's own recommendation (may differ from <see cref="CallerForm"/>).</param>
/// <param name="Warnings">
/// List of warnings when the form is valid but not optimal (e.g. ITR-2 used instead of ITR-1).
/// Empty when <see cref="CallerForm"/> == <see cref="SuggestedForm"/>.
/// </param>
/// <param name="IneligibilityReason">Non-null when <see cref="IsEligible"/> is false, explaining the rule violated.</param>
public record ItrFormValidation(
    string CallerForm,
    bool IsEligible,
    string? SuggestedForm,
    IReadOnlyList<string> Warnings,
    string? IneligibilityReason);
