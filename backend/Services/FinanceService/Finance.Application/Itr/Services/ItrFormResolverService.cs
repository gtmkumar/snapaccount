using ItrService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Services;

/// <summary>
/// Derives the appropriate ITR form (ITR-1 through ITR-4) from income heads,
/// assessee type, and assessment-year-specific rules loaded from configuration.
///
/// DG-ITR-10: implements <see cref="IItrFormResolver"/>.
///
/// Indian IT Rules summary (AY 2024-25 onwards; threshold changes are config-driven):
///   ITR-1 (Sahaj) — Individual only; salary + ≤1 house property + other sources;
///                    total income ≤ ₹50L; no capital gains; no business income.
///   ITR-2          — Individual/HUF; capital gains OR multiple house properties
///                    OR foreign assets; no business/professional income.
///   ITR-3          — Individual/HUF with business/professional income under regular books.
///   ITR-4 (Sugam)  — Individual/HUF/Firm; presumptive taxation (44AD/44AE/44ADA);
///                    total income ≤ ₹50L; business turnover within presumptive limits.
///
/// Config keys (all under "Itr:FormResolver"):
///   Itr1IncomeThresholdCr   — ITR-1 total-income cap in crore (default 0.50 = ₹50L)
///   Itr4IncomeThresholdCr   — ITR-4 total-income cap in crore (default 0.50 = ₹50L)
///   Sec44AdTurnoverLimitCr  — 44AD turnover cap in crore (default 2.00 = ₹2Cr)
///   Sec44AdaTurnoverLimitCr — 44ADA gross receipts cap in crore (default 0.50 = ₹50L)
/// </summary>
public sealed class ItrFormResolverService(IConfiguration configuration) : IItrFormResolver
{
    // ── Config-driven thresholds (INR expressed in crore) ─────────────────────
    // Using IConfiguration["key"] (IConfiguration.Abstractions) with manual decimal parse
    // avoids a dependency on Microsoft.Extensions.Configuration.Binder.

    private decimal Itr1ThresholdCr =>
        ParseDecimalConfig("Itr:FormResolver:Itr1IncomeThresholdCr", 0.50m);

    private decimal Itr4ThresholdCr =>
        ParseDecimalConfig("Itr:FormResolver:Itr4IncomeThresholdCr", 0.50m);

    private decimal Sec44AdTurnoverCr =>
        ParseDecimalConfig("Itr:FormResolver:Sec44AdTurnoverLimitCr", 2.00m);

    private decimal Sec44AdaTurnoverCr =>
        ParseDecimalConfig("Itr:FormResolver:Sec44AdaTurnoverLimitCr", 0.50m);

    private decimal ParseDecimalConfig(string key, decimal defaultValue)
    {
        var raw = configuration[key];
        return raw is not null && decimal.TryParse(raw, out var parsed) ? parsed : defaultValue;
    }

    private const decimal LakhsPerCrore = 100m;

    /// <inheritdoc/>
    public ItrFormSuggestion DetermineForm(ItrFormResolverRequest request, string assessmentYear)
    {
        // ── Step 1: entity/non-individual types are outside ITR-1..4 auto-scope ────
        if (!IsIndividualOrHuf(request.AssesseeType) && !IsFirmForItr4(request.AssesseeType, request.IsPresumptiveTaxation))
        {
            return new ItrFormSuggestion(
                SuggestedForm: null,
                Reasons: [$"AssesseeType '{request.AssesseeType}' is outside the ITR-1..4 auto-determination scope. Please specify the form explicitly."],
                IsOutsideAutoScope: true);
        }

        var reasons = new List<string>();

        // ── Step 2: ITR-4 (Sugam) — presumptive taxation path ────────────────────
        // Eligible: Individual/HUF/Firm, presumptive taxation, total income ≤ threshold,
        // turnover within 44AD/44ADA limits.
        if (request.IsPresumptiveTaxation
            && IsIndividualHufOrFirm(request.AssesseeType)
            && request.CapitalGains == 0
            && !request.HasForeignAssets)
        {
            bool withinIncomeThreshold = InCrore(request.TotalIncome) <= Itr4ThresholdCr;
            bool withinTurnoverLimit = IsWithinPresumptiveTurnoverLimit(request);

            if (withinIncomeThreshold && withinTurnoverLimit)
            {
                reasons.Add($"Presumptive taxation elected (Section 44AD/44AE/44ADA).");
                reasons.Add($"Total income ≤ ₹{Itr4ThresholdCr * LakhsPerCrore:0}L threshold for ITR-4.");
                return new ItrFormSuggestion("ITR-4", reasons, false);
            }

            // Presumptive elected but thresholds exceeded — falls through to ITR-3.
            if (!withinIncomeThreshold)
                reasons.Add($"Presumptive taxation elected but total income exceeds ₹{Itr4ThresholdCr * LakhsPerCrore:0}L — ITR-3 required.");
            else
                reasons.Add("Presumptive taxation elected but turnover exceeds prescribed limit — ITR-3 required.");
        }

        // ── Step 3: Business/professional income without presumptive → ITR-3 ──────
        if (request.BusinessIncome != 0 && !request.IsPresumptiveTaxation)
        {
            reasons.Add("Business/professional income under regular books of account → ITR-3.");
            return new ItrFormSuggestion("ITR-3", reasons, false);
        }

        // ITR-3 also applies when presumptive was elected but thresholds are exceeded:
        if (request.IsPresumptiveTaxation && reasons.Count > 0)
        {
            // reasons already explains why ITR-4 was not applicable.
            return new ItrFormSuggestion("ITR-3", reasons, false);
        }

        // ── Step 4: Capital gains OR foreign assets OR multiple house properties → ITR-2 ──
        if (request.CapitalGains != 0)
        {
            reasons.Add("Capital gains income present → ITR-2 required.");
            return new ItrFormSuggestion("ITR-2", reasons, false);
        }

        if (request.HasForeignAssets)
        {
            reasons.Add("Foreign assets or foreign income → ITR-2 required.");
            return new ItrFormSuggestion("ITR-2", reasons, false);
        }

        if (request.HasMultipleHouseProperties)
        {
            reasons.Add("Multiple house properties → ITR-2 required.");
            return new ItrFormSuggestion("ITR-2", reasons, false);
        }

        // HUF cannot file ITR-1 (only Individual).
        if (string.Equals(request.AssesseeType, "HUF", StringComparison.OrdinalIgnoreCase))
        {
            reasons.Add("HUF assessees must file ITR-2 (ITR-1 is restricted to Individual).");
            return new ItrFormSuggestion("ITR-2", reasons, false);
        }

        // ── Step 5: ITR-1 eligibility — Individual only, total income ≤ threshold ─
        bool itr1EligibleByIncome = InCrore(request.TotalIncome) <= Itr1ThresholdCr;

        if (!itr1EligibleByIncome)
        {
            reasons.Add($"Total income exceeds ₹{Itr1ThresholdCr * LakhsPerCrore:0}L cap for ITR-1 → ITR-2.");
            return new ItrFormSuggestion("ITR-2", reasons, false);
        }

        // ── Step 6: Default → ITR-1 (Sahaj) ──────────────────────────────────────
        reasons.Add($"Individual with salary/house property/other sources, total income ≤ ₹{Itr1ThresholdCr * LakhsPerCrore:0}L, no capital gains.");
        return new ItrFormSuggestion("ITR-1", reasons, false);
    }

    /// <inheritdoc/>
    public Result<ItrFormValidation> ValidateCallerForm(
        string callerForm,
        ItrFormResolverRequest request,
        string assessmentYear)
    {
        var validForms = new[] { "ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6", "ITR-7" };
        if (!validForms.Contains(callerForm, StringComparer.OrdinalIgnoreCase))
            return Error.Validation("Filing.InvalidForm",
                $"'{callerForm}' is not a valid ITR form. Valid forms: {string.Join(", ", validForms)}.");

        // ITR-5/6/7 are outside auto-scope; pass through without further checks.
        if (callerForm is "ITR-5" or "ITR-6" or "ITR-7")
        {
            return new ItrFormValidation(
                callerForm, IsEligible: true, SuggestedForm: callerForm,
                Warnings: [], IneligibilityReason: null);
        }

        var suggestion = DetermineForm(request, assessmentYear);

        // Outside auto-scope (entity type) — can't validate; let it pass.
        if (suggestion.IsOutsideAutoScope)
        {
            return new ItrFormValidation(
                callerForm, IsEligible: true, SuggestedForm: null,
                Warnings: suggestion.Reasons, IneligibilityReason: null);
        }

        var suggestedForm = suggestion.SuggestedForm!;
        var warnings = new List<string>();

        // ── Hard ineligibility rules ──────────────────────────────────────────────

        // ITR-1: must not have capital gains, business income, foreign assets,
        //        multiple house properties, income > threshold, or be HUF.
        if (callerForm == "ITR-1")
        {
            if (request.CapitalGains != 0)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-1 is not applicable when capital gains are present.");

            if (request.BusinessIncome != 0)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-1 is not applicable when business/professional income is present.");

            if (request.HasForeignAssets)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-1 is not applicable when foreign assets or foreign income are present.");

            if (request.HasMultipleHouseProperties)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-1 is not applicable for assessees with multiple house properties.");

            if (string.Equals(request.AssesseeType, "HUF", StringComparison.OrdinalIgnoreCase))
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-1 is not applicable for HUF assessees. Use ITR-2.");

            if (InCrore(request.TotalIncome) > Itr1ThresholdCr)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], $"ITR-1 is not applicable when total income exceeds ₹{Itr1ThresholdCr * LakhsPerCrore:0}L.");
        }

        // ITR-4: only Individual/HUF/Firm; presumptive; no capital gains; no foreign assets; within threshold.
        if (callerForm == "ITR-4")
        {
            if (!IsIndividualHufOrFirm(request.AssesseeType))
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], $"ITR-4 is not applicable for AssesseeType '{request.AssesseeType}'.");

            if (request.CapitalGains != 0)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-4 is not applicable when capital gains are present.");

            if (request.HasForeignAssets)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], "ITR-4 is not applicable when foreign assets or foreign income are present.");

            if (InCrore(request.TotalIncome) > Itr4ThresholdCr)
                return new ItrFormValidation(callerForm, IsEligible: false, suggestedForm,
                    [], $"ITR-4 is not applicable when total income exceeds ₹{Itr4ThresholdCr * LakhsPerCrore:0}L.");

            if (!request.IsPresumptiveTaxation)
                warnings.Add("ITR-4 is used for presumptive taxation; if you do not elect presumptive taxation, consider ITR-3.");
        }

        // ── Soft warnings when caller chose a higher form than necessary ──────────
        if (callerForm != suggestedForm && warnings.Count == 0)
        {
            warnings.Add($"Suggested form is {suggestedForm} based on the income profile. " +
                         $"{callerForm} is valid but may be more complex than needed.");
            warnings.AddRange(suggestion.Reasons);
        }

        return new ItrFormValidation(
            callerForm, IsEligible: true, suggestedForm,
            warnings.AsReadOnly(), IneligibilityReason: null);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool IsIndividualOrHuf(string assesseeType) =>
        assesseeType is "INDIVIDUAL" or "HUF"
        || string.Equals(assesseeType, "INDIVIDUAL", StringComparison.OrdinalIgnoreCase)
        || string.Equals(assesseeType, "HUF", StringComparison.OrdinalIgnoreCase);

    private static bool IsFirmForItr4(string assesseeType, bool isPresumptive) =>
        isPresumptive &&
        string.Equals(assesseeType, "FIRM", StringComparison.OrdinalIgnoreCase);

    private static bool IsIndividualHufOrFirm(string assesseeType) =>
        assesseeType.ToUpperInvariant() is "INDIVIDUAL" or "HUF" or "FIRM";

    private bool IsWithinPresumptiveTurnoverLimit(ItrFormResolverRequest request)
    {
        if (request.AnnualTurnoverCr is null)
            return true; // cannot validate without turnover — assume eligible

        // 44ADA (professionals): gross receipts ≤ Sec44AdaTurnoverCr
        // 44AD (business): turnover ≤ Sec44AdTurnoverCr
        // We check against the more restrictive professional limit when business income is 0
        // (proxy: no business income suggests professional receipts).
        decimal turnoverCr = request.AnnualTurnoverCr.Value;
        if (request.BusinessIncome == 0)
            return turnoverCr <= Sec44AdaTurnoverCr;

        return turnoverCr <= Sec44AdTurnoverCr;
    }

    /// <summary>Converts an INR amount to crore for threshold comparison.</summary>
    private static decimal InCrore(decimal inr) => inr / (LakhsPerCrore * 100_000m);
}
