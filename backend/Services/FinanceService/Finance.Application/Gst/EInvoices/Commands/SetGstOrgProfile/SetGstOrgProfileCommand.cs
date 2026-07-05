using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.EInvoices.Commands.SetGstOrgProfile;

/// <summary>
/// Creates or updates the GST org profile for an organisation.
/// DG-GST-05: the profile stores annual turnover used for the e-invoice threshold gate.
/// An admin can also force-enable e-invoicing via <paramref name="EInvoiceEnabled"/>.
/// </summary>
[RequiresPermission("gst.org-profile.write")]
public record SetGstOrgProfileCommand(
    Guid OrganizationId,
    /// <summary>Annual turnover in Crore (INR). Set to null to clear the value.</summary>
    decimal? AnnualTurnoverCr,
    /// <summary>When true, e-invoice is always enabled regardless of turnover.</summary>
    bool EInvoiceEnabled,
    /// <summary>Financial year the turnover applies to (e.g. '2024-25'). Optional.</summary>
    string? EffectiveFromFy = null)
    : ICommand<SetGstOrgProfileResponse>;

/// <summary>Response after upserting the GST org profile.</summary>
public record SetGstOrgProfileResponse(
    Guid OrgProfileId,
    Guid OrganizationId,
    decimal? AnnualTurnoverCr,
    bool EInvoiceEnabled);

/// <summary>Validates the SetGstOrgProfileCommand.</summary>
public sealed class SetGstOrgProfileCommandValidator : AbstractValidator<SetGstOrgProfileCommand>
{
    public SetGstOrgProfileCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.AnnualTurnoverCr)
            .GreaterThanOrEqualTo(0)
            .When(x => x.AnnualTurnoverCr.HasValue)
            .WithMessage("Annual turnover must be a non-negative value in Crore.");
    }
}

/// <summary>
/// Upserts the GST org profile for the organisation.
/// If no profile exists, creates one; otherwise updates the existing one.
/// DG-GST-05: supplies the turnover gate for e-invoice enforcement.
/// </summary>
public sealed class SetGstOrgProfileCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<SetGstOrgProfileCommand, SetGstOrgProfileResponse>
{
    /// <inheritdoc />
    public async Task<Result<SetGstOrgProfileResponse>> Handle(
        SetGstOrgProfileCommand request,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.GstOrgProfiles
            .Where(p => p.OrganizationId == request.OrganizationId && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is null)
        {
            var profile = GstOrgProfile.Create(
                organizationId: request.OrganizationId,
                annualTurnoverCr: request.AnnualTurnoverCr,
                eInvoiceEnabled: request.EInvoiceEnabled,
                effectiveFromFy: request.EffectiveFromFy);

            dbContext.GstOrgProfiles.Add(profile);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new SetGstOrgProfileResponse(
                profile.Id,
                profile.OrganizationId,
                profile.AnnualTurnoverCr,
                profile.EInvoiceEnabled);
        }

        existing.Update(
            annualTurnoverCr: request.AnnualTurnoverCr,
            eInvoiceEnabled: request.EInvoiceEnabled,
            effectiveFromFy: request.EffectiveFromFy);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new SetGstOrgProfileResponse(
            existing.Id,
            existing.OrganizationId,
            existing.AnnualTurnoverCr,
            existing.EInvoiceEnabled);
    }
}
