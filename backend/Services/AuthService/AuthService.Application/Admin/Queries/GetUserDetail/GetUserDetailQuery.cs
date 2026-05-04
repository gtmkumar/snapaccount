using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetUserDetail;

/// <summary>
/// Returns a single user's profile + their primary organization business
/// profile for the admin per-user detail page. SYSTEM_ADMIN only.
/// </summary>
[RequiresPermission("admin.users.read")]
public record GetUserDetailQuery(Guid UserId) : IQuery<UserDetailDto>;

public record UserDetailDto(
    Guid Id,
    string Name,
    string? Phone,
    string? Email,
    bool IsActive,
    string? PreferredLanguage,
    DateTime JoinedAt,
    UserBusinessProfileDto? Business);

public record UserBusinessProfileDto(
    Guid OrganizationId,
    string BusinessName,
    string? Gstin,
    string? PanNumber,
    string? IndustryType,
    decimal? AnnualTurnoverInr,
    string? State);

public sealed class GetUserDetailQueryValidator : AbstractValidator<GetUserDetailQuery>
{
    public GetUserDetailQueryValidator() => RuleFor(x => x.UserId).NotEmpty();
}

public sealed class GetUserDetailQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetUserDetailQuery, UserDetailDto>
{
    public async Task<Result<UserDetailDto>> Handle(GetUserDetailQuery request, CancellationToken ct)
    {
        var user = await db.Users
            .Where(u => u.Id == request.UserId && !u.IsDeleted)
            .Select(u => new
            {
                u.Id, u.FullName, u.PhoneNumber, u.Email, u.IsActive,
                u.CreatedAt, u.PreferredLanguage,
            })
            .FirstOrDefaultAsync(ct);

        if (user is null)
            return Error.NotFound("User.NotFound", $"User {request.UserId} not found.");

        // Primary organization (caller's first owned org if any).
        var business = await db.Organizations
            .Where(o => o.OwnerUserId == request.UserId && o.DeletedAt == null)
            .OrderBy(o => o.CreatedAt)
            .Select(o => new UserBusinessProfileDto(
                o.Id, o.BusinessName, o.Gstin, o.PanNumber,
                o.IndustryType, o.AnnualTurnoverInr, o.State))
            .FirstOrDefaultAsync(ct);

        return new UserDetailDto(
            user.Id,
            user.FullName ?? "(no name)",
            user.PhoneNumber,
            user.Email,
            user.IsActive,
            user.PreferredLanguage,
            user.CreatedAt,
            business);
    }
}
