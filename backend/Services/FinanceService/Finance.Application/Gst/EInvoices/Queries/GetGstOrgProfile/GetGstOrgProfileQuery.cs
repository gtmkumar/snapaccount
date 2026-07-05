using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.EInvoices.Queries.GetGstOrgProfile;

/// <summary>
/// Returns the GST org profile for an organisation, including annual turnover
/// and e-invoice applicability flag.
/// DG-GST-05: used by admin to view/manage the e-invoice threshold gate.
/// </summary>
[RequiresPermission("gst.org-profile.read")]
public record GetGstOrgProfileQuery(Guid OrganizationId) : IQuery<GstOrgProfileDto>;

/// <summary>Read-side DTO for a GST org profile.</summary>
public record GstOrgProfileDto(
    Guid Id,
    Guid OrganizationId,
    decimal? AnnualTurnoverCr,
    bool EInvoiceEnabled,
    string? EffectiveFromFy,
    /// <summary>Whether e-invoice is mandatory given the current config threshold.</summary>
    bool IsEInvoiceMandatory,
    decimal ThresholdCrore);

/// <summary>Handler for <see cref="GetGstOrgProfileQuery"/>.</summary>
public sealed class GetGstOrgProfileQueryHandler(
    IGstDbContext dbContext,
    IGstServiceOptions options)
    : IQueryHandler<GetGstOrgProfileQuery, GstOrgProfileDto>
{
    /// <inheritdoc />
    public async Task<Result<GstOrgProfileDto>> Handle(
        GetGstOrgProfileQuery request,
        CancellationToken cancellationToken)
    {
        var profile = await dbContext.GstOrgProfiles
            .Where(p => p.OrganizationId == request.OrganizationId && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        var threshold = options.EInvoiceThresholdCrore;

        if (profile is null)
        {
            // Return a default (not-configured) profile so the UI can prompt setup.
            return new GstOrgProfileDto(
                Id: Guid.Empty,
                OrganizationId: request.OrganizationId,
                AnnualTurnoverCr: null,
                EInvoiceEnabled: false,
                EffectiveFromFy: null,
                IsEInvoiceMandatory: false,
                ThresholdCrore: threshold);
        }

        return new GstOrgProfileDto(
            Id: profile.Id,
            OrganizationId: profile.OrganizationId,
            AnnualTurnoverCr: profile.AnnualTurnoverCr,
            EInvoiceEnabled: profile.EInvoiceEnabled,
            EffectiveFromFy: profile.EffectiveFromFy,
            IsEInvoiceMandatory: profile.IsEInvoiceMandatory(threshold),
            ThresholdCrore: threshold);
    }
}
