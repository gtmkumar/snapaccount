using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.DeleteAvailabilityRule;

/// <summary>
/// Soft-deletes (deactivates) a CA availability rule.
/// Future generator runs will ignore rules with IsActive = false or DeletedAt set.
/// Does NOT delete already-generated slots — those remain bookable.
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record DeleteAvailabilityRuleCommand(Guid RuleId) : ICommand<DeleteAvailabilityRuleResponse>;

/// <summary>Response after deleting a rule.</summary>
public record DeleteAvailabilityRuleResponse(Guid RuleId, bool Deleted);

/// <summary>Validates DeleteAvailabilityRuleCommand.</summary>
public sealed class DeleteAvailabilityRuleCommandValidator : AbstractValidator<DeleteAvailabilityRuleCommand>
{
    public DeleteAvailabilityRuleCommandValidator()
    {
        RuleFor(x => x.RuleId).NotEmpty();
    }
}

/// <summary>
/// Handles DeleteAvailabilityRuleCommand.
/// Scoped to the calling CA — cannot delete another CA's rules (IDOR guard).
/// </summary>
public sealed class DeleteAvailabilityRuleCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<DeleteAvailabilityRuleCommand, DeleteAvailabilityRuleResponse>
{
    /// <inheritdoc />
    public async Task<Result<DeleteAvailabilityRuleResponse>> Handle(
        DeleteAvailabilityRuleCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<DeleteAvailabilityRuleResponse>.Failure(
                Error.Unauthorized("AvailabilityRule.Unauthenticated", "User is not authenticated."));

        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (caProfile == null)
            return Result<DeleteAvailabilityRuleResponse>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        // IDOR: scoped to calling CA's profile
        var rule = await db.CaAvailabilityRules
            .FirstOrDefaultAsync(r => r.Id == request.RuleId && r.CaProfileId == caProfile.Id,
                cancellationToken);

        if (rule == null)
            return Result<DeleteAvailabilityRuleResponse>.Failure(
                Error.NotFound("AvailabilityRule.NotFound", "Availability rule not found."));

        rule.Deactivate();
        await db.SaveChangesAsync(cancellationToken);

        return Result<DeleteAvailabilityRuleResponse>.Success(
            new DeleteAvailabilityRuleResponse(rule.Id, true));
    }
}
