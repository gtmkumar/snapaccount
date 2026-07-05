using GstService.Application.Ims.Commands.ApplyDeemedAcceptance;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using GstService.Infrastructure.Persistence;

namespace GstService.Infrastructure.Jobs;

/// <summary>
/// Hangfire recurring job that applies GSTN IMS deemed-acceptance at GSTR-2B generation time.
///
/// Regulatory basis: CGST circular on IMS (mandatory from 1 Apr 2026).
/// When GSTR-2B is generated (typically the 14th of each month), any invoice that
/// remains in PENDING or PENDING_KEPT status is automatically deemed ACCEPTED and
/// the ITC flows into GSTR-2B. This job enforces that rule by:
/// <list type="bullet">
///   <item>Computing the prior-month return period (MMYYYY format).</item>
///   <item>Dispatching <see cref="ApplyDeemedAcceptanceCommand"/> once per active organisation.</item>
///   <item>Writing one <c>gst.ims_action_logs</c> row per affected invoice (action = DEEMED_ACCEPTED, source = SYSTEM).</item>
/// </list>
///
/// Cron schedule: 14th of every month at 02:00 IST (UTC+05:30 → UTC 20:30 on 13th).
/// Configured in <c>GstService.Api/Program.cs</c> via <c>RecurringJob.AddOrUpdate</c>.
///
/// Idempotency: <see cref="ApplyDeemedAcceptanceCommand"/> is idempotent — invoices already
/// in ACCEPTED or REJECTED state are skipped. Running the job twice is harmless.
/// </summary>
public sealed class ImsDeemedAcceptanceJob(
    IServiceScopeFactory scopeFactory,
    ILogger<ImsDeemedAcceptanceJob> logger)
{
    /// <summary>
    /// Entry point called by Hangfire on the 14th of each month.
    /// Iterates over all organisations with PENDING IMS invoices in the prior period
    /// and dispatches the deemed-acceptance sweep command for each.
    /// </summary>
    public async Task RunAsync()
    {
        // GSTR-2B is generated for the PREVIOUS month's return period.
        // The job runs on the 14th, so today's date gives us the current month.
        // Prior period = month before today in MMYYYY format.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var priorMonth = today.AddMonths(-1);
        var period = $"{priorMonth.Month:D2}{priorMonth.Year}";

        logger.LogInformation(
            "ImsDeemedAcceptanceJob starting — period={Period} (GSTR-2B generation sweep)",
            period);

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GstDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        // Find all distinct organisations that have PENDING/PENDING_KEPT invoices for this period.
        var orgIds = await db.ImsInvoices
            .Where(i => i.Period == period
                     && (i.Status == "PENDING" || i.Status == "PENDING_KEPT")
                     && i.DeletedAt == null)
            .Select(i => i.OrganizationId)
            .Distinct()
            .ToListAsync();

        if (orgIds.Count == 0)
        {
            logger.LogInformation(
                "ImsDeemedAcceptanceJob: no PENDING invoices found for period={Period} — nothing to do.",
                period);
            return;
        }

        logger.LogInformation(
            "ImsDeemedAcceptanceJob: found {OrgCount} organisation(s) with pending invoices for period={Period}",
            orgIds.Count, period);

        var totalDeemed = 0;
        foreach (var orgId in orgIds)
        {
            var cmd = new ApplyDeemedAcceptanceCommand(orgId, period);
            var result = await sender.Send(cmd);
            if (result.IsSuccess)
            {
                totalDeemed += result.Value.DeemedAccepted;
                logger.LogInformation(
                    "ImsDeemedAcceptanceJob: org={OrgId} period={Period} deemedCount={Count}",
                    orgId, period, result.Value.DeemedAccepted);
            }
            else
            {
                logger.LogError(
                    "ImsDeemedAcceptanceJob: org={OrgId} period={Period} failed — {Error}",
                    orgId, period, result.Error.Message);
            }
        }

        logger.LogInformation(
            "ImsDeemedAcceptanceJob complete — period={Period} totalDeemedAccepted={Total}",
            period, totalDeemed);
    }
}
