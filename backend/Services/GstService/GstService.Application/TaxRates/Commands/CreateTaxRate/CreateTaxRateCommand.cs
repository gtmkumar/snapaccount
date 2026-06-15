using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.TaxRates.Commands.CreateTaxRate;

/// <summary>
/// GAP-022: Creates a new effective-dated GST tax rate version.
/// GST rates must be configuration-driven (CLAUDE.md mandate) — zero code deployments
/// when government announces a rate change.
///
/// Enforces the "no overlapping active rates for the same rate name" invariant:
/// any existing row with the same RateName and ValidTo = NULL is automatically
/// terminated (ValidTo set to validFrom - 1 day) before the new rate is created.
/// </summary>
[RequiresPermission("gst.admin.taxrates")]
public record CreateTaxRateCommand(
    string RateName,
    decimal RatePct,
    DateOnly ValidFrom,
    string? Notes) : ICommand<CreateTaxRateResponse>;

/// <summary>Response after creating a tax rate.</summary>
public record CreateTaxRateResponse(
    Guid TaxRateId,
    string RateName,
    decimal RatePct,
    decimal CgstPct,
    decimal SgstPct,
    decimal IgstPct,
    DateOnly ValidFrom);

/// <summary>Validates the CreateTaxRateCommand.</summary>
public sealed class CreateTaxRateCommandValidator : AbstractValidator<CreateTaxRateCommand>
{
    private static readonly decimal[] ValidGstRates = [0m, 1.5m, 3m, 5m, 7.5m, 12m, 18m, 28m];

    /// <summary>Initialises validation rules.</summary>
    public CreateTaxRateCommandValidator()
    {
        RuleFor(x => x.RateName)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.RatePct)
            .InclusiveBetween(0m, 100m)
            .WithMessage("GST rate must be between 0 and 100 percent.")
            .Must(r => ValidGstRates.Contains(r))
            .WithMessage(r =>
                $"GST rate {r.RatePct}% is not a standard Indian GST rate. " +
                $"Valid rates: {string.Join(", ", ValidGstRates.Select(v => $"{v}%"))}.");

        // NOTE: ValidGstRates are the government-mandated slabs (0, 1.5, 3, 5, 7.5, 12, 18, 28).
        // BUG-W6-001: The Must() rule above is the enforcement — the prior comment saying
        // "warn but do not block" was incorrect. A 400 is required per the QA spec.

        RuleFor(x => x.ValidFrom)
            .NotEmpty();

        RuleFor(x => x.Notes)
            .MaximumLength(1000)
            .When(x => x.Notes is not null);
    }
}

/// <summary>Handles <see cref="CreateTaxRateCommand"/>.</summary>
public sealed class CreateTaxRateCommandHandler(IGstDbContext db)
    : ICommandHandler<CreateTaxRateCommand, CreateTaxRateResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateTaxRateResponse>> Handle(
        CreateTaxRateCommand request,
        CancellationToken cancellationToken)
    {
        // Terminate any currently-active rate with the same name so we don't get overlaps
        var existingActive = await db.GstTaxRates
            .Where(r => r.RateName == request.RateName
                && r.ValidTo == null
                && r.IsActive
                && r.DeletedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var existing in existingActive)
        {
            // Set ValidTo to one day before the new rate takes effect
            var terminateAt = request.ValidFrom.AddDays(-1);
            existing.Terminate(terminateAt);
        }

        var newRate = GstTaxRate.Create(
            rateName: request.RateName,
            ratePct: request.RatePct,
            validFrom: request.ValidFrom,
            notes: request.Notes);

        db.GstTaxRates.Add(newRate);
        await db.SaveChangesAsync(cancellationToken);

        return Result<CreateTaxRateResponse>.Success(new CreateTaxRateResponse(
            TaxRateId: newRate.Id,
            RateName: newRate.RateName,
            RatePct: newRate.RatePct,
            CgstPct: newRate.CgstPct,
            SgstPct: newRate.SgstPct,
            IgstPct: newRate.IgstPct,
            ValidFrom: newRate.ValidFrom));
    }
}
