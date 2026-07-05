using ChatService.Application.Common.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;
using Microsoft.EntityFrameworkCore;

namespace ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;

/// <summary>
/// On-demand slot generation from a CA's active availability rules.
///
/// Materialises <see cref="Domain.Entities.AppointmentSlot"/> rows for the next
/// <paramref name="WeeksAhead"/> weeks from today (default 4). Idempotent: already-existing
/// slots for the same (ca_profile_id, start_utc) are silently skipped.
///
/// The actual generation logic lives in <see cref="ISlotGenerationService"/> (Infrastructure),
/// shared with the weekly Hangfire job <c>GenerateSlotsFromRulesJob</c>.
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record GenerateSlotsFromRulesCommand(
    Guid? CaProfileId = null,
    int WeeksAhead = 4) : ICommand<GenerateSlotsFromRulesResponse>;

/// <summary>Result of an on-demand slot generation pass.</summary>
public record GenerateSlotsFromRulesResponse(
    Guid CaProfileId,
    int RulesProcessed,
    int SlotsCreated,
    int SlotsSkipped);

/// <summary>Validates GenerateSlotsFromRulesCommand.</summary>
public sealed class GenerateSlotsFromRulesCommandValidator : AbstractValidator<GenerateSlotsFromRulesCommand>
{
    public GenerateSlotsFromRulesCommandValidator()
    {
        RuleFor(x => x.WeeksAhead).InclusiveBetween(1, 52)
            .WithMessage("WeeksAhead must be between 1 and 52.");
    }
}

/// <summary>
/// Handles GenerateSlotsFromRulesCommand.
/// Delegates generation to <see cref="ISlotGenerationService"/> so the same logic
/// is shared with the Hangfire job.
/// </summary>
public sealed class GenerateSlotsFromRulesCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser,
    ISlotGenerationService slotGenerationService) : ICommandHandler<GenerateSlotsFromRulesCommand, GenerateSlotsFromRulesResponse>
{
    /// <inheritdoc />
    public async Task<Result<GenerateSlotsFromRulesResponse>> Handle(
        GenerateSlotsFromRulesCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<GenerateSlotsFromRulesResponse>.Failure(
                Error.Unauthorized("GenerateSlots.Unauthenticated", "User is not authenticated."));

        Guid targetProfileId;

        if (request.CaProfileId.HasValue)
        {
            // ACM-04 (IDOR): a non-super caller may only generate slots for their OWN
            // CA profile. Without this check any holder of chat.slots.manage could
            // materialise slots on another CA's schedule by passing that CA's profile id.
            if (!currentUser.HasPermission("*"))
            {
                var ownsProfile = await db.CaProfiles.AnyAsync(
                    p => p.Id == request.CaProfileId.Value && p.UserId == currentUser.UserId,
                    cancellationToken);

                if (!ownsProfile)
                    return Result<GenerateSlotsFromRulesResponse>.Failure(
                        Error.Forbidden("CaProfile.NotOwner",
                            "You may only generate slots for your own CA profile."));
            }

            targetProfileId = request.CaProfileId.Value;
        }
        else
        {
            var caProfile = await db.CaProfiles
                .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

            if (caProfile == null)
                return Result<GenerateSlotsFromRulesResponse>.Failure(
                    Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

            targetProfileId = caProfile.Id;
        }

        // Count active rules for the response (for informational purposes)
        var ruleCount = await db.CaAvailabilityRules
            .CountAsync(r => r.CaProfileId == targetProfileId && r.IsActive, cancellationToken);

        var (created, skipped) = await slotGenerationService.GenerateAsync(
            targetProfileId, request.WeeksAhead, cancellationToken);

        return Result<GenerateSlotsFromRulesResponse>.Success(
            new GenerateSlotsFromRulesResponse(targetProfileId, ruleCount, created, skipped));
    }
}

/// <summary>
/// Application-layer interface for slot generation (implemented in Infrastructure).
/// Enables the command handler to use the generation logic without a circular dependency.
/// </summary>
public interface ISlotGenerationService
{
    /// <summary>
    /// Generates slots from active rules for the given CA profile for the next
    /// <paramref name="weeksAhead"/> weeks.
    /// </summary>
    /// <returns>Tuple of (slotsCreated, slotsSkipped).</returns>
    Task<(int Created, int Skipped)> GenerateAsync(Guid caProfileId, int weeksAhead, CancellationToken ct = default);
}
