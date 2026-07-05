using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Commands.ApplyDeemedAcceptance;

/// <summary>
/// Applies deemed acceptance to all IMS invoices that remain PENDING or PENDING_KEPT
/// for a given organisation and period, simulating the GSTN GSTR-2B generation trigger.
///
/// Per GSTN IMS rules: when GSTR-2B is generated (typically the 14th of each month),
/// any invoice on which the taxpayer has not taken explicit action is deemed ACCEPTED
/// and flows into GSTR-2B ITC calculations.
///
/// This command is designed to be invoked by Hangfire on a monthly schedule or by the
/// GSTR-2B generation webhook. It writes <see cref="ImsActionLog"/> entries with
/// DEEMED_ACCEPTED action for each affected invoice.
///
/// Idempotent: invoices already in ACCEPTED/REJECTED state are unaffected.
/// </summary>
/// <remarks>
/// No <c>[RequiresPermission]</c> attribute — this is a system-internal command invoked
/// by the Hangfire scheduler, not directly by an API user.
/// </remarks>
public record ApplyDeemedAcceptanceCommand(
    Guid OrganizationId,
    string Period) : ICommand<ApplyDeemedAcceptanceResponse>;

/// <summary>Response from the deemed acceptance sweep.</summary>
public record ApplyDeemedAcceptanceResponse(
    int DeemedAccepted,
    string Period,
    Guid OrganizationId);

/// <summary>Handler for <see cref="ApplyDeemedAcceptanceCommand"/>.</summary>
public sealed class ApplyDeemedAcceptanceCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<ApplyDeemedAcceptanceCommand, ApplyDeemedAcceptanceResponse>
{
    /// <inheritdoc />
    public async Task<Result<ApplyDeemedAcceptanceResponse>> Handle(
        ApplyDeemedAcceptanceCommand request,
        CancellationToken cancellationToken)
    {
        // Load all PENDING / PENDING_KEPT invoices for this org + period
        var pendingInvoices = await dbContext.ImsInvoices
            .Where(i => i.OrganizationId == request.OrganizationId
                     && i.Period == request.Period
                     && (i.Status == "PENDING" || i.Status == "PENDING_KEPT")
                     && i.DeletedAt == null)
            .ToListAsync(cancellationToken);

        if (pendingInvoices.Count == 0)
            return new ApplyDeemedAcceptanceResponse(0, request.Period, request.OrganizationId);

        var deemedCount = 0;
        foreach (var invoice in pendingInvoices)
        {
            var previousStatus = invoice.Status;
            var changed = invoice.ApplyDeemedAcceptance();
            if (!changed) continue;

            deemedCount++;
            var logEntry = ImsActionLog.Create(
                imsInvoiceId: invoice.Id,
                organizationId: invoice.OrganizationId,
                action: "DEEMED_ACCEPTED",
                previousStatus: previousStatus,
                newStatus: invoice.Status,
                actedBy: null, // system event
                reason: "Automatic deemed acceptance at GSTR-2B generation (GSTN IMS rule)",
                isBulk: true);
            dbContext.ImsActionLogs.Add(logEntry);
        }

        if (deemedCount > 0)
            await dbContext.SaveChangesAsync(cancellationToken);

        return new ApplyDeemedAcceptanceResponse(deemedCount, request.Period, request.OrganizationId);
    }
}
