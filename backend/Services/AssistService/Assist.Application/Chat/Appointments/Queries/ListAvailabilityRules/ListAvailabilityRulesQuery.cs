using ChatService.Application.Appointments.Commands.CreateAvailabilityRule;
using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Queries.ListAvailabilityRules;

/// <summary>
/// Lists recurring availability rules for a CA profile.
/// Admin can query any CA by providing CaProfileId; a CA user sees only their own rules
/// when CaProfileId is omitted (resolved from the calling user's CA profile).
///
/// RBAC: requires chat.slots.manage.
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record ListAvailabilityRulesQuery(
    Guid? CaProfileId = null,
    bool ActiveOnly = true) : IQuery<ListAvailabilityRulesResponse>;

/// <summary>Paginated availability rules response.</summary>
public record ListAvailabilityRulesResponse(IReadOnlyList<AvailabilityRuleResponse> Items);

/// <summary>Validates ListAvailabilityRulesQuery.</summary>
public sealed class ListAvailabilityRulesQueryValidator : AbstractValidator<ListAvailabilityRulesQuery>
{
    public ListAvailabilityRulesQueryValidator() { }
}

/// <summary>Handles ListAvailabilityRulesQuery.</summary>
public sealed class ListAvailabilityRulesQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListAvailabilityRulesQuery, ListAvailabilityRulesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListAvailabilityRulesResponse>> Handle(
        ListAvailabilityRulesQuery request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<ListAvailabilityRulesResponse>.Failure(
                Error.Unauthorized("AvailabilityRule.Unauthenticated", "User is not authenticated."));

        Guid targetProfileId;

        if (request.CaProfileId.HasValue)
        {
            // ACM-04 (IDOR): a non-super caller may only target their OWN CA profile.
            // Without this check any holder of chat.slots.manage could read another CA's
            // availability rules simply by passing that CA's profile id.
            if (!currentUser.HasPermission("*"))
            {
                var ownsProfile = await db.CaProfiles.AnyAsync(
                    p => p.Id == request.CaProfileId.Value && p.UserId == currentUser.UserId,
                    cancellationToken);

                if (!ownsProfile)
                    return Result<ListAvailabilityRulesResponse>.Failure(
                        Error.Forbidden("CaProfile.NotOwner",
                            "You may only view availability rules for your own CA profile."));
            }

            targetProfileId = request.CaProfileId.Value;
        }
        else
        {
            // Resolve from caller's user ID
            var caProfile = await db.CaProfiles
                .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

            if (caProfile == null)
                return Result<ListAvailabilityRulesResponse>.Failure(
                    Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

            targetProfileId = caProfile.Id;
        }

        var query = db.CaAvailabilityRules
            .Where(r => r.CaProfileId == targetProfileId);

        if (request.ActiveOnly)
            query = query.Where(r => r.IsActive);

        var items = await query
            .OrderBy(r => r.Weekday)
            .ThenBy(r => r.StartTimeIst)
            .Select(r => new AvailabilityRuleResponse(
                r.Id, r.CaProfileId, r.Weekday, r.StartTimeIst, r.EndTimeIst,
                r.SlotDurationMinutes, r.EffectiveFrom, r.EffectiveTo, r.IsActive, r.CreatedAt))
            .ToListAsync(cancellationToken);

        return Result<ListAvailabilityRulesResponse>.Success(new ListAvailabilityRulesResponse(items));
    }
}
