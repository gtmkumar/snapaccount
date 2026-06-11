using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.CreateAvailabilityRule;

/// <summary>
/// Creates a new recurring weekly availability rule for the calling CA.
/// Slot generation for the next N weeks is deferred to the weekly Hangfire job
/// (or triggered immediately via <c>POST /appointments/availability-rules/{id}/generate</c>).
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record CreateAvailabilityRuleCommand(
    int Weekday,
    TimeSpan StartTimeIst,
    TimeSpan EndTimeIst,
    int SlotDurationMinutes,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo = null) : ICommand<AvailabilityRuleResponse>;

/// <summary>Response DTO for a CA availability rule.</summary>
public record AvailabilityRuleResponse(
    Guid RuleId,
    Guid CaProfileId,
    int Weekday,
    TimeSpan StartTimeIst,
    TimeSpan EndTimeIst,
    int SlotDurationMinutes,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    bool IsActive,
    DateTime CreatedAt);

/// <summary>Validates CreateAvailabilityRuleCommand.</summary>
public sealed class CreateAvailabilityRuleCommandValidator : AbstractValidator<CreateAvailabilityRuleCommand>
{
    public CreateAvailabilityRuleCommandValidator()
    {
        RuleFor(x => x.Weekday).InclusiveBetween(0, 6)
            .WithMessage("Weekday must be 0 (Sunday) through 6 (Saturday).");
        RuleFor(x => x.StartTimeIst).GreaterThanOrEqualTo(TimeSpan.Zero)
            .LessThan(TimeSpan.FromHours(24))
            .WithMessage("StartTimeIst must be a valid time-of-day offset.");
        RuleFor(x => x.EndTimeIst)
            .GreaterThan(x => x.StartTimeIst)
            .WithMessage("EndTimeIst must be after StartTimeIst.")
            .LessThanOrEqualTo(TimeSpan.FromHours(24));
        RuleFor(x => x.SlotDurationMinutes).InclusiveBetween(15, 480)
            .WithMessage("Slot duration must be 15–480 minutes.");
        RuleFor(x => x.EffectiveFrom).NotEmpty();
        RuleFor(x => x.EffectiveTo)
            .GreaterThanOrEqualTo(x => x.EffectiveFrom)
            .When(x => x.EffectiveTo.HasValue)
            .WithMessage("EffectiveTo must be on or after EffectiveFrom.");
    }
}

/// <summary>
/// Handles CreateAvailabilityRuleCommand.
/// Resolves the CA profile for the calling user then creates the rule.
/// </summary>
public sealed class CreateAvailabilityRuleCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CreateAvailabilityRuleCommand, AvailabilityRuleResponse>
{
    /// <inheritdoc />
    public async Task<Result<AvailabilityRuleResponse>> Handle(
        CreateAvailabilityRuleCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<AvailabilityRuleResponse>.Failure(
                Error.Unauthorized("AvailabilityRule.Unauthenticated", "User is not authenticated."));

        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (caProfile == null)
            return Result<AvailabilityRuleResponse>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        var ruleResult = CaAvailabilityRule.Create(
            caProfile.Id,
            request.Weekday,
            request.StartTimeIst,
            request.EndTimeIst,
            request.SlotDurationMinutes,
            request.EffectiveFrom,
            request.EffectiveTo);

        if (!ruleResult.IsSuccess)
            return Result<AvailabilityRuleResponse>.Failure(ruleResult.Error!);

        db.CaAvailabilityRules.Add(ruleResult.Value!);
        await db.SaveChangesAsync(cancellationToken);

        return Result<AvailabilityRuleResponse>.Success(MapToResponse(ruleResult.Value!));
    }

    internal static AvailabilityRuleResponse MapToResponse(CaAvailabilityRule r)
        => new(r.Id, r.CaProfileId, r.Weekday, r.StartTimeIst, r.EndTimeIst,
               r.SlotDurationMinutes, r.EffectiveFrom, r.EffectiveTo, r.IsActive, r.CreatedAt);
}
