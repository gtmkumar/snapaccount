using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.StartFiling;

/// <summary>
/// Creates a new ITR filing in DRAFT status for the given assessee and assessment year.
/// Phase 6D.
///
/// DG-ITR-10: <see cref="ItrFormType"/> is now OPTIONAL. When omitted (null/empty) the handler
/// auto-derives the form from income heads and assessee type via <see cref="IItrFormResolver"/>.
/// When the caller supplies a form that is ineligible per IT rules, the command returns a
/// Validation failure with a clear explanation. When the form is valid but sub-optimal, the
/// filing is created and warnings are surfaced in <see cref="StartFilingResponse.FormWarnings"/>.
/// </summary>
[RequiresPermission("itr.filings.create")]
public record StartFilingCommand(
    Guid AssesseeId,
    string AssessmentYear,
    /// <summary>
    /// Optional ITR form type override. When null or empty the handler auto-derives it.
    /// When provided, it is validated against the income profile; ineligible forms are rejected.
    /// </summary>
    string? ItrFormType,
    string Regime,
    // ── Income heads for auto-determination (DG-ITR-10) ─────────────────────
    // These are optional when ItrFormType is explicitly supplied by the caller.
    // When ItrFormType is omitted, at least the assessee type is needed from the DB profile.
    decimal SalaryIncome = 0,
    decimal HousePropertyIncome = 0,
    decimal BusinessIncome = 0,
    decimal CapitalGains = 0,
    decimal OtherIncome = 0,
    bool HasMultipleHouseProperties = false,
    bool IsPresumptiveTaxation = false,
    bool HasForeignAssets = false,
    decimal? AnnualTurnoverCr = null) : ICommand<StartFilingResponse>;

/// <summary>
/// Response for StartFilingCommand.
/// DG-ITR-10: <see cref="ResolvedItrFormType"/> is the form actually stored (may differ from
/// the caller's request when auto-derived). <see cref="FormWarnings"/> is non-empty when the
/// caller supplied a valid-but-suboptimal form.
/// </summary>
public record StartFilingResponse(
    Guid FilingId,
    string AssessmentYear,
    string Status,
    /// <summary>The ITR form type stored on the filing (auto-derived or validated override).</summary>
    string ResolvedItrFormType,
    /// <summary>Non-empty when the caller's supplied form differs from the auto-suggested form.</summary>
    IReadOnlyList<string> FormWarnings);

public sealed class StartFilingCommandValidator : AbstractValidator<StartFilingCommand>
{
    private static readonly string[] ValidRegimes = ["OLD", "NEW"];
    private static readonly string[] ValidForms = ["ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6", "ITR-7"];

    public StartFilingCommandValidator()
    {
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.AssessmentYear)
            .NotEmpty()
            .Matches(@"^AY\d{4}-\d{2}$")
            .WithMessage("AssessmentYear must be in format AY2025-26.");

        // ItrFormType is optional; when provided it must be a valid form string.
        When(x => !string.IsNullOrEmpty(x.ItrFormType), () =>
        {
            RuleFor(x => x.ItrFormType!)
                .Must(f => ValidForms.Contains(f))
                .WithMessage($"ItrFormType must be one of: {string.Join(", ", ValidForms)}.");
        });

        RuleFor(x => x.Regime)
            .Must(r => ValidRegimes.Contains(r))
            .WithMessage("Regime must be OLD or NEW.");

        RuleFor(x => x.SalaryIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.BusinessIncome).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CapitalGains).GreaterThanOrEqualTo(0);
        RuleFor(x => x.OtherIncome).GreaterThanOrEqualTo(0);
    }
}

/// <summary>
/// Handles StartFilingCommand.
/// DG-ITR-10: auto-derives ITR form from the assessee profile + supplied income heads
/// when the caller omits ItrFormType. Validates caller-supplied forms against IT rules.
/// </summary>
public sealed class StartFilingCommandHandler(
    IItrDbContext dbContext,
    ICurrentUser currentUser,
    IItrFormResolver formResolver)
    : ICommandHandler<StartFilingCommand, StartFilingResponse>
{
    public async Task<Result<StartFilingResponse>> Handle(
        StartFilingCommand request, CancellationToken cancellationToken)
    {
        // DG-ITR-05: user_id is NOT NULL in itr.filings — must be set from the authenticated user.
        if (currentUser.UserId == Guid.Empty)
            return Error.Validation("Filing.MissingUser", "Authenticated user ID is required to start a filing.");

        // Idempotency: only one active filing per AY
        var existing = await dbContext.Filings
            .FirstOrDefaultAsync(
                f => f.AssesseeId == request.AssesseeId
                     && f.AssessmentYear == request.AssessmentYear
                     && f.DeletedAt == null,
                cancellationToken);

        if (existing is not null)
            return Error.Conflict("Filing.AlreadyExists",
                $"A filing for {request.AssessmentYear} already exists (status: {existing.Status}).");

        // ── DG-ITR-10: Resolve ITR form ───────────────────────────────────────────

        // Load assessee profile to get the assessee type for form determination.
        var assessee = await dbContext.Assessees
            .FirstOrDefaultAsync(a => a.Id == request.AssesseeId && a.DeletedAt == null, cancellationToken);

        if (assessee is null)
            return Error.NotFound("Assessee.NotFound", $"Assessee {request.AssesseeId} not found.");

        string assesseeType = assessee.AssesseeType;
        decimal? annualTurnoverCr = request.AnnualTurnoverCr ?? assessee.AnnualTurnoverCr;

        var resolverRequest = new ItrFormResolverRequest(
            AssesseeType: assesseeType,
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
            AnnualTurnoverCr: annualTurnoverCr);

        string resolvedFormType;
        IReadOnlyList<string> formWarnings;

        if (string.IsNullOrEmpty(request.ItrFormType))
        {
            // Auto-derive the form.
            var suggestion = formResolver.DetermineForm(resolverRequest, request.AssessmentYear);

            if (suggestion.IsOutsideAutoScope)
                return Error.Validation("Filing.FormRequired",
                    $"AssesseeType '{assesseeType}' requires an explicit ITR form (ITR-5, ITR-6, or ITR-7). " +
                    "Auto-determination is only supported for INDIVIDUAL, HUF, and FIRM (presumptive) assessees.");

            resolvedFormType = suggestion.SuggestedForm!;
            formWarnings = [];
        }
        else
        {
            // Validate the caller-supplied form against IT rules.
            var validationResult = formResolver.ValidateCallerForm(
                request.ItrFormType, resolverRequest, request.AssessmentYear);

            if (validationResult.IsFailure)
                return validationResult.Error;

            var validation = validationResult.Value;

            if (!validation.IsEligible)
            {
                // Hard ineligibility — reject with clear explanation.
                return Error.Validation("Filing.FormIneligible",
                    $"Form '{request.ItrFormType}' is not applicable for this income profile: " +
                    $"{validation.IneligibilityReason} Suggested form: {validation.SuggestedForm}.");
            }

            resolvedFormType = request.ItrFormType;
            formWarnings = validation.Warnings;
        }

        // ── Create the filing ─────────────────────────────────────────────────────

        // DG-ITR-05: pass the authenticated user ID so user_id NOT NULL is satisfied.
        var filing = Filing.Create(
            request.AssesseeId, request.AssessmentYear,
            resolvedFormType, request.Regime, currentUser.UserId);

        dbContext.Filings.Add(filing);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new StartFilingResponse(
            filing.Id, filing.AssessmentYear, filing.Status,
            filing.ItrFormType, formWarnings);
    }
}
