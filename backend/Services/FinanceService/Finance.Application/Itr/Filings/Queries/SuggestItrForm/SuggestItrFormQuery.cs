using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.SuggestItrForm;

/// <summary>
/// Returns the suggested ITR form (ITR-1..4) for the given income profile and assessee type.
/// Also validates a caller-supplied form when <see cref="CallerSuppliedForm"/> is provided.
///
/// DG-ITR-10: exposes the <see cref="IItrFormResolver"/> as a query so clients can call
/// GET /itr/filings/suggest-form before creating a filing.
///
/// Permissions: itr.filings.read (same as ListFilings — any authenticated ITR user).
/// </summary>
[RequiresPermission("itr.filings.read")]
public record SuggestItrFormQuery(
    string AssesseeType,
    decimal SalaryIncome,
    decimal HousePropertyIncome,
    decimal BusinessIncome,
    decimal CapitalGains,
    decimal OtherIncome,
    string AssessmentYear,
    bool HasMultipleHouseProperties = false,
    bool IsPresumptiveTaxation = false,
    bool HasForeignAssets = false,
    decimal? AnnualTurnoverCr = null,
    /// <summary>
    /// Optional: when set, the response includes a <see cref="SuggestItrFormResponse.Validation"/>
    /// indicating whether the caller-supplied form is eligible and any warnings.
    /// </summary>
    string? CallerSuppliedForm = null) : IQuery<SuggestItrFormResponse>;

/// <summary>
/// Response DTO for GET /itr/filings/suggest-form.
/// </summary>
/// <param name="SuggestedForm">
/// Server-derived ITR form recommendation. Null when assessee type is outside ITR-1..4 scope.
/// </param>
/// <param name="IsOutsideAutoScope">
/// True when the assessee type requires ITR-5/6/7 — the caller must supply the form explicitly.
/// </param>
/// <param name="Reasons">
/// Human-readable list of income rules that drove the determination.
/// </param>
/// <param name="Validation">
/// Present only when <see cref="SuggestItrFormQuery.CallerSuppliedForm"/> was provided.
/// Indicates whether the caller's form is eligible and lists any warnings.
/// </param>
public record SuggestItrFormResponse(
    string? SuggestedForm,
    bool IsOutsideAutoScope,
    IReadOnlyList<string> Reasons,
    SuggestItrFormValidationDto? Validation);

/// <summary>
/// Inline DTO for caller-form validation within <see cref="SuggestItrFormResponse"/>.
/// </summary>
public record SuggestItrFormValidationDto(
    string CallerForm,
    bool IsEligible,
    string? SuggestedForm,
    IReadOnlyList<string> Warnings,
    string? IneligibilityReason);

public sealed class SuggestItrFormQueryValidator : AbstractValidator<SuggestItrFormQuery>
{
    private static readonly string[] ValidAssesseeTypes =
        ["INDIVIDUAL", "HUF", "FIRM", "COMPANY", "AOP", "BOI", "AJP"];

    public SuggestItrFormQueryValidator()
    {
        RuleFor(x => x.AssesseeType)
            .NotEmpty()
            .Must(t => ValidAssesseeTypes.Contains(t, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"AssesseeType must be one of: {string.Join(", ", ValidAssesseeTypes)}.");

        RuleFor(x => x.AssessmentYear)
            .NotEmpty()
            .Matches(@"^AY\d{4}-\d{2}$")
            .WithMessage("AssessmentYear must be in format AY2025-26.");

        RuleFor(x => x.SalaryIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.HousePropertyIncome).GreaterThanOrEqualTo(-10_000_000m)
            .LessThanOrEqualTo(10_000_000_000m); // allow losses (negative)
        RuleFor(x => x.BusinessIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CapitalGains).GreaterThanOrEqualTo(0);
        RuleFor(x => x.OtherIncome).GreaterThanOrEqualTo(0);

        When(x => x.CallerSuppliedForm is not null, () =>
        {
            RuleFor(x => x.CallerSuppliedForm!)
                .Matches(@"^ITR-[1-7]$")
                .WithMessage("CallerSuppliedForm must be one of: ITR-1, ITR-2, ITR-3, ITR-4, ITR-5, ITR-6, ITR-7.");
        });
    }
}

public sealed class SuggestItrFormQueryHandler(IItrFormResolver formResolver)
    : IQueryHandler<SuggestItrFormQuery, SuggestItrFormResponse>
{
    public Task<Result<SuggestItrFormResponse>> Handle(
        SuggestItrFormQuery request, CancellationToken cancellationToken)
    {
        var resolverRequest = new ItrFormResolverRequest(
            AssesseeType: request.AssesseeType,
            SalaryIncome: request.SalaryIncome,
            HousePropertyIncome: request.HousePropertyIncome,
            BusinessIncome: request.BusinessIncome,
            CapitalGains: request.CapitalGains,
            OtherIncome: request.OtherIncome,
            TotalIncome: request.SalaryIncome + request.HousePropertyIncome
                         + request.BusinessIncome + request.CapitalGains + request.OtherIncome,
            HasMultipleHouseProperties: request.HasMultipleHouseProperties,
            IsPresumptiveTaxation: request.IsPresumptiveTaxation,
            HasForeignAssets: request.HasForeignAssets,
            AnnualTurnoverCr: request.AnnualTurnoverCr);

        var suggestion = formResolver.DetermineForm(resolverRequest, request.AssessmentYear);

        SuggestItrFormValidationDto? validationDto = null;
        if (request.CallerSuppliedForm is not null)
        {
            var validationResult = formResolver.ValidateCallerForm(
                request.CallerSuppliedForm, resolverRequest, request.AssessmentYear);

            if (validationResult.IsFailure)
            {
                // Propagate hard validation errors (invalid form string) as query failures.
                return Task.FromResult(Result<SuggestItrFormResponse>.Failure(validationResult.Error));
            }

            var v = validationResult.Value;
            validationDto = new SuggestItrFormValidationDto(
                v.CallerForm, v.IsEligible, v.SuggestedForm,
                v.Warnings, v.IneligibilityReason);
        }

        var response = new SuggestItrFormResponse(
            suggestion.SuggestedForm,
            suggestion.IsOutsideAutoScope,
            suggestion.Reasons,
            validationDto);

        return Task.FromResult(Result<SuggestItrFormResponse>.Success(response));
    }
}
