using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Services;

/// <summary>
/// System-level slot generation service.
/// Materialises <see cref="AppointmentSlot"/> rows from active <see cref="CaAvailabilityRule"/>
/// entries for a given CA profile.
///
/// Called by:
/// <list type="bullet">
///   <item><see cref="GenerateSlotsFromRulesJob"/> (Hangfire weekly recurring job)</item>
///   <item><see cref="ChatService.Application.Appointments.Commands.GenerateSlotsFromRules.GenerateSlotsFromRulesCommandHandler"/>
///         (on-demand via authenticated HTTP endpoint)</item>
/// </list>
///
/// IST offset: UTC+05:30 (Asia/Kolkata).
/// Idempotency: slots with an existing (ca_profile_id, start_utc) are silently skipped.
/// </summary>
public sealed class SlotGenerationService(
    IChatServiceDbContext db,
    ILogger<SlotGenerationService> logger) : ISlotGenerationService
{
    private static readonly TimeZoneInfo IstZone =
        TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");

    /// <inheritdoc />
    public async Task<(int Created, int Skipped)> GenerateAsync(
        Guid caProfileId,
        int weeksAhead,
        CancellationToken ct = default)
    {
        var rules = await db.CaAvailabilityRules
            .Where(r => r.CaProfileId == caProfileId && r.IsActive)
            .ToListAsync(ct);

        if (rules.Count == 0)
            return (0, 0);

        var nowUtc = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(nowUtc);
        var endDate = today.AddDays(weeksAhead * 7);

        // Load existing slot start times for this CA to skip duplicates
        var existingStartTimes = await db.AppointmentSlots
            .Where(s => s.CaProfileId == caProfileId && s.StartUtc >= nowUtc.Date)
            .Select(s => s.StartUtc)
            .ToHashSetAsync(ct);

        int created = 0, skipped = 0;

        foreach (var rule in rules)
        {
            var cursor = today;
            while (cursor <= endDate)
            {
                if ((int)cursor.DayOfWeek == rule.Weekday
                    && cursor >= rule.EffectiveFrom
                    && (!rule.EffectiveTo.HasValue || cursor <= rule.EffectiveTo.Value))
                {
                    var windowStart = rule.StartTimeIst;
                    var windowEnd = rule.EndTimeIst;
                    var duration = TimeSpan.FromMinutes(rule.SlotDurationMinutes);

                    var slotStart = windowStart;
                    while (slotStart + duration <= windowEnd)
                    {
                        var istDateTime = cursor.ToDateTime(TimeOnly.FromTimeSpan(slotStart));
                        var utcStart = TimeZoneInfo.ConvertTimeToUtc(istDateTime, IstZone);
                        var utcEnd = utcStart.Add(duration);

                        if (existingStartTimes.Contains(utcStart))
                        {
                            skipped++;
                        }
                        else if (utcStart > nowUtc)
                        {
                            var newSlot = AppointmentSlot.CreateFromRule(caProfileId, utcStart, utcEnd);
                            db.AppointmentSlots.Add(newSlot);
                            existingStartTimes.Add(utcStart);
                            created++;
                        }

                        slotStart = slotStart.Add(duration);
                    }
                }
                cursor = cursor.AddDays(1);
            }
        }

        if (created > 0)
            await db.SaveChangesAsync(ct);

        logger.LogDebug(
            "SlotGenerationService: caProfile={CaProfileId} created={Created} skipped={Skipped}",
            caProfileId, created, skipped);

        return (created, skipped);
    }
}
