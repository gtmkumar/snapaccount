using ChatService.Application.Appointments.Commands.CompleteAppointment;
using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Jobs;

/// <summary>
/// Hangfire recurring job that auto-completes CONFIRMED appointments whose slot end time
/// has passed (slot_end_utc &lt;= NOW()) without being manually completed by the CA.
///
/// DG-CHAT-02: Unblocks the rating path — <see cref="Domain.Entities.Appointment.Rate"/>
/// requires Status == COMPLETED, but Complete() was never called automatically.
///
/// Schedule: Every 5 minutes (ensures most appointments are completed within 5 minutes
/// of the slot ending so users can rate promptly).
///
/// Idempotency: only operates on CONFIRMED appointments whose slot end time has passed.
/// Re-running the job is safe — completed/cancelled/no-show appointments are skipped.
/// </summary>
public sealed class AutoCompleteAppointmentsJob(
    IServiceScopeFactory scopeFactory,
    ILogger<AutoCompleteAppointmentsJob> logger)
{
    /// <summary>Entry point called by Hangfire every 5 minutes.</summary>
    public async Task RunAsync()
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IChatServiceDbContext>();

        // Find CONFIRMED appointments whose slot ended more than 0 minutes ago.
        // We join via SlotId to get the slot end time.
        var overdueAppointments = await db.Appointments
            .Join(db.AppointmentSlots,
                appt => appt.SlotId,
                slot => slot.Id,
                (appt, slot) => new { appt, slot })
            .Where(x => x.appt.Status == AppointmentStatus.Confirmed
                      && x.slot.EndUtc <= DateTime.UtcNow)
            .Select(x => x.appt.Id)
            .ToListAsync();

        if (overdueAppointments.Count == 0)
        {
            logger.LogDebug("AutoCompleteAppointmentsJob: no overdue appointments to complete.");
            return;
        }

        logger.LogInformation(
            "AutoCompleteAppointmentsJob: completing {Count} overdue appointment(s).",
            overdueAppointments.Count);

        // Send CompleteAppointmentCommand for each — SkipOwnerCheck=true bypasses
        // the CA-profile IDOR guard since this is a system-initiated completion.
        // We do NOT use MediatR here (would trigger PermissionBehavior without an HTTP context).
        // Instead we call the domain entity directly, mirroring the GenerateSlotsFromRulesJob pattern.
        var completed = 0;
        var skipped = 0;

        foreach (var appointmentId in overdueAppointments)
        {
            var appointment = await db.Appointments
                .FirstOrDefaultAsync(a => a.Id == appointmentId);

            if (appointment is null) { skipped++; continue; }

            var result = appointment.Complete();
            if (!result.IsSuccess)
            {
                logger.LogWarning(
                    "AutoCompleteAppointmentsJob: could not complete appointment {Id}: {Error}",
                    appointmentId, result.Error!.Message);
                skipped++;
                continue;
            }

            completed++;
        }

        if (completed > 0)
            await db.SaveChangesAsync(CancellationToken.None);

        logger.LogInformation(
            "AutoCompleteAppointmentsJob: completed={Completed} skipped={Skipped}",
            completed, skipped);
    }
}
