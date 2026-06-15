using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ChatService.Infrastructure.Jobs;

/// <summary>
/// Hangfire recurring job that materialises appointment slots from active CA availability rules.
///
/// Schedule: Every Sunday at 01:00 IST (Saturday 19:30 UTC) — generates slots for the next
/// 4 weeks so CAs always have at least 4 weeks of availability visible to SME users.
///
/// Registered via <c>app.Lifetime.ApplicationStarted</c> in <c>Program.cs</c> following the
/// GstService/ImsDeemedAcceptanceJob pattern (never as a static pre-app.Run call).
///
/// Idempotency: slots are skipped when a matching (ca_profile_id, start_utc) already exists
/// in chat.appointment_slots.
///
/// This job does NOT call through MediatR (which would trigger PermissionBehavior and fail
/// due to the absence of an HTTP context and authenticated user). It calls the generation
/// logic directly via <see cref="ISlotGenerationService"/> — a thin infrastructure service
/// registered in <see cref="DependencyInjection"/>.
/// </summary>
public sealed class GenerateSlotsFromRulesJob(
    IServiceScopeFactory scopeFactory,
    ILogger<GenerateSlotsFromRulesJob> logger)
{
    private const int WeeksAhead = 4;

    /// <summary>
    /// Entry point called by Hangfire each Sunday at 01:00 IST.
    /// Iterates every CA profile with at least one active availability rule
    /// and triggers slot generation for the next <see cref="WeeksAhead"/> weeks.
    /// </summary>
    public async Task RunAsync()
    {
        logger.LogInformation(
            "GenerateSlotsFromRulesJob starting — generating {Weeks}-week slot horizon.", WeeksAhead);

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IChatServiceDbContext>();
        var generator = scope.ServiceProvider.GetRequiredService<ISlotGenerationService>();

        // Find all CA profiles that have at least one active rule
        var caProfileIds = await db.CaAvailabilityRules
            .Where(r => r.IsActive && r.DeletedAt == null)
            .Select(r => r.CaProfileId)
            .Distinct()
            .ToListAsync();

        if (caProfileIds.Count == 0)
        {
            logger.LogInformation("GenerateSlotsFromRulesJob: no active availability rules found — nothing to do.");
            return;
        }

        logger.LogInformation(
            "GenerateSlotsFromRulesJob: generating slots for {Count} CA profile(s).", caProfileIds.Count);

        var totalCreated = 0;
        var totalSkipped = 0;

        foreach (var caProfileId in caProfileIds)
        {
            var (created, skipped) = await generator.GenerateAsync(caProfileId, WeeksAhead);
            totalCreated += created;
            totalSkipped += skipped;
            logger.LogDebug(
                "GenerateSlotsFromRulesJob: caProfile={CaProfileId} created={Created} skipped={Skipped}",
                caProfileId, created, skipped);
        }

        logger.LogInformation(
            "GenerateSlotsFromRulesJob complete — profiles={Count} totalCreated={Created} totalSkipped={Skipped}",
            caProfileIds.Count, totalCreated, totalSkipped);
    }
}

