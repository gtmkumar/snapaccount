using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.ListUsers;

/// <summary>
/// Paginated CUSTOMER list for the admin Users page (design Screen 84).
///
/// SCOPE — customers only: this list is the public/mobile population (SME owners +
/// their employees). Internal SnapAccount staff (CA, reviewer, ops, admins) AND the
/// operator's own org members (e.g. ORG_ADMIN, DEV_LIMITED_MANAGER) are EXCLUDED —
/// they live on the Team page.
///
/// "Customer" is defined POSITIVELY (a real product end-user), not merely by the
/// absence of a platform role. A user is a customer when BOTH hold:
///   (a) they have NO active platform <c>auth.user_role</c> (those are internal staff —
///       see <see cref="AuthService.Application.Admin.Queries.GetTeamMembers"/>), AND
///   (b) they are a genuine product user — i.e. they OWN an organisation (a business
///       owner) OR carry a customer profile type (BUSINESS_OWNER / EMPLOYEE; mobile
///       signup always creates such a profile via RegisterUserCommand).
///
/// The negative-only rule ("no user_role") previously leaked operator org-members who
/// hold neither a platform role nor any customer signal (org-membership only) into the
/// customer list; clause (b) closes that leak without hiding any real customer.
///
/// <paramref name="UserType"/> further narrows within customers (BUSINESS_OWNER /
/// EMPLOYEE); null = all customer types. Joins each user to their primary owned
/// organisation (if any) for GSTIN + state without a per-row roundtrip. SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.users.read")]
public record ListUsersQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    bool? IsActive = null,
    string? UserType = null) : IQuery<PaginatedResult<UserListItemDto>>;

public record UserListItemDto(
    Guid Id,
    string Name,
    string? Phone,
    string? Email,
    bool IsActive,
    string? UserType,
    DateTime JoinedAt,
    Guid? OrganizationId,
    string? BusinessName,
    string? Gstin,
    string? State);

public sealed class ListUsersQueryValidator : AbstractValidator<ListUsersQuery>
{
    // Customer-facing user types only — staff types (STAFF/DATA_ENTRY_OPERATOR) are
    // not selectable here because staff are excluded from this list entirely.
    private static readonly string[] CustomerUserTypes = ["BUSINESS_OWNER", "EMPLOYEE"];

    public ListUsersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.UserType)
            .Must(t => t == null || CustomerUserTypes.Contains(t))
            .WithMessage("UserType filter must be BUSINESS_OWNER or EMPLOYEE.");
    }
}

public sealed class ListUsersQueryHandler(IAuthDbContext db)
    : IQueryHandler<ListUsersQuery, PaginatedResult<UserListItemDto>>
{
    // Customer-facing profile types (staff use STAFF / null). A user carrying one of
    // these — or owning an organisation — is treated as a real customer.
    private static readonly string[] CustomerUserTypes = ["BUSINESS_OWNER", "EMPLOYEE"];

    public async Task<Result<PaginatedResult<UserListItemDto>>> Handle(ListUsersQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        // Outer-join users to their first owned org so the table can show
        // business-level columns without a per-row N+1, and to their profile for
        // the user_type column. Customers only: exclude anyone holding an active
        // platform user_role (those are internal staff — shown on the Team page).
        var baseQuery =
            from u in db.Users
            where !u.IsDeleted
               && !db.UserRoles.Any(ur => ur.UserId == u.Id && ur.IsActive && ur.DeletedAt == null)
            join orgJoin in db.Organizations.Where(o => o.DeletedAt == null)
                on u.Id equals orgJoin.OwnerUserId into orgGroup
            from o in orgGroup.OrderBy(o => o.CreatedAt).Take(1).DefaultIfEmpty()
            join profJoin in db.UserProfiles.Where(p => p.DeletedAt == null)
                on u.Id equals profJoin.UserId into profGroup
            from prof in profGroup.DefaultIfEmpty()
            select new { u, o, prof };

        // POSITIVE customer test (closes the org-member leak — see class doc clause (b)):
        // keep only genuine product end-users — those who own an organisation (business
        // owners) or carry a customer profile type. A user with no platform role AND no
        // customer signal (org-membership only, e.g. an operator's ORG_ADMIN /
        // DEV_LIMITED_MANAGER) is NOT a customer and is filtered out here.
        baseQuery = baseQuery.Where(x =>
            x.o != null
            || (x.prof != null && CustomerUserTypes.Contains(x.prof.UserType)));

        if (request.IsActive.HasValue)
            baseQuery = baseQuery.Where(x => x.u.IsActive == request.IsActive.Value);

        if (!string.IsNullOrWhiteSpace(request.UserType))
            baseQuery = baseQuery.Where(x => x.prof != null && x.prof.UserType == request.UserType);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // Lower-cased contains; relies on Postgres' citext-style folding
            // for ascii ranges. Adequate for name/phone/GSTIN search; if we
            // ever need full unicode case-folding we can swap to citext columns.
            var term = request.Search.Trim().ToLowerInvariant();
            baseQuery = baseQuery.Where(x =>
                (x.u.FullName != null && x.u.FullName.ToLower().Contains(term))
             || (x.u.PhoneNumber != null && x.u.PhoneNumber.ToLower().Contains(term))
             || (x.u.Email != null && x.u.Email.ToLower().Contains(term))
             || (x.o != null && x.o.BusinessName.ToLower().Contains(term))
             || (x.o != null && x.o.Gstin != null && x.o.Gstin.ToLower().Contains(term)));
        }

        var total = await baseQuery.CountAsync(ct);

        var items = await baseQuery
            .OrderBy(x => x.u.FullName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new UserListItemDto(
                x.u.Id,
                x.u.FullName ?? "(no name)",
                x.u.PhoneNumber,
                x.u.Email,
                x.u.IsActive,
                x.prof != null ? x.prof.UserType : null,
                x.u.CreatedAt,
                x.o != null ? x.o.Id : (Guid?)null,
                x.o != null ? x.o.BusinessName : null,
                x.o != null ? x.o.Gstin : null,
                x.o != null ? x.o.State : null))
            .ToListAsync(ct);

        return Result<PaginatedResult<UserListItemDto>>.Success(
            PaginatedResult<UserListItemDto>.Create(items, total, page, pageSize));
    }
}
