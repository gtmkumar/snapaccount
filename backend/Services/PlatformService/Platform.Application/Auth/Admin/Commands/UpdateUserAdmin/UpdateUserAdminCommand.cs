using AuthService.Application.Common.Guards;
using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Commands.UpdateUserAdmin;

/// <summary>
/// Edits an existing user (Phase B, Increment 1.4).
///
/// MUTABLE:   FullName, PreferredLanguage, UserType, IsActive, Profile/KYC,
///            RoleId (within the user's existing scope), permission overrides.
/// IMMUTABLE: Email, PhoneNumber, scope (platform↔org), OrganizationId. These are
///            not accepted on edit — the scope is derived from the user's current
///            role assignment and cannot change here.
///
/// DELEGATION (mirrors CreateUserAdminCommand — I1.3-001):
///   • Assigning a SYSTEM + platform-scoped role requires the caller's "*" wildcard.
///     platform.admins.invite alone is NOT sufficient.
///   • New role perms ⊆ caller's effective set (else 403 Role.PrivilegeEscalation).
///   • New override perms ⊆ caller's effective set (else 403).
///
/// PAN (SEC-013): a non-empty Profile.PanNumber is re-encrypted and replaces the
/// stored value. An empty/null PanNumber leaves the existing encrypted PAN intact
/// (the edit dialog shows only a masked PAN and submits blank to keep it).
/// </summary>
[RequiresPermission(Permissions.PlatformAdminsInvite)]
public record UpdateUserAdminCommand(
    Guid UserId,
    string FullName,
    Guid RoleId,
    IReadOnlyList<Guid>? PermissionIds,
    string? PreferredLanguage = null,
    string? UserType = null,
    bool IsActive = true,
    UserProfileInput? Profile = null,
    IReadOnlyList<Guid>? DeniedPermissionIds = null) : ICommand<UpdateUserAdminResponse>;

/// <summary>Optional profile/KYC fields captured at admin user edit.</summary>
public record UserProfileInput(
    string? PanNumber = null,
    string? AadhaarLast4 = null,
    DateOnly? DateOfBirth = null,
    string? Gender = null,
    string? AddressLine1 = null,
    string? AddressLine2 = null,
    string? City = null,
    string? State = null,
    string? Pincode = null,
    string? Country = null);

/// <summary>Response returned on successful user update.</summary>
public record UpdateUserAdminResponse(
    Guid UserId,
    string Scope,
    Guid RoleId,
    IReadOnlyList<string> GrantedPermissions);

public sealed class UpdateUserAdminCommandValidator : AbstractValidator<UpdateUserAdminCommand>
{
    public UpdateUserAdminCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(300);
        RuleFor(x => x.RoleId).NotEmpty();

        RuleFor(x => x.PermissionIds)
            .Must(ids => ids == null || ids.Count <= 100)
            .WithMessage("Cannot assign more than 100 direct permission overrides.");

        RuleFor(x => x.DeniedPermissionIds!)
            .Must(ids => ids.Count <= 100)
            .When(x => x.DeniedPermissionIds is not null)
            .WithMessage("Cannot deny more than 100 direct permission overrides.");

        // An override permission can't be both allowed and denied for the same user.
        RuleFor(x => x)
            .Must(x => x.DeniedPermissionIds is null || x.PermissionIds is null
                       || !x.PermissionIds.Intersect(x.DeniedPermissionIds).Any())
            .WithMessage("A permission cannot be both granted and denied for the same user.")
            .WithName("PermissionIds");

        When(x => x.Profile is not null, () =>
        {
            When(x => !string.IsNullOrEmpty(x.Profile!.PanNumber), () =>
                RuleFor(x => x.Profile!.PanNumber!)
                    .Matches(@"^[A-Z]{5}[0-9]{4}[A-Z]$")
                    .WithMessage("PAN must be in AAAAA9999A format."));

            When(x => !string.IsNullOrEmpty(x.Profile!.AadhaarLast4), () =>
                RuleFor(x => x.Profile!.AadhaarLast4!)
                    .Matches(@"^[0-9]{4}$").WithMessage("Aadhaar last-4 must be exactly 4 digits."));

            When(x => !string.IsNullOrEmpty(x.Profile!.Pincode), () =>
                RuleFor(x => x.Profile!.Pincode!)
                    .Matches(@"^[0-9]{6}$").WithMessage("Pincode must be 6 digits."));

            When(x => x.Profile!.DateOfBirth is not null, () =>
                RuleFor(x => x.Profile!.DateOfBirth!.Value)
                    .Must(d => d <= DateOnly.FromDateTime(DateTime.UtcNow))
                    .WithMessage("Date of birth cannot be in the future."));
        });
    }
}

public sealed class UpdateUserAdminCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IPanEncryptionService panEncryption)
    : ICommandHandler<UpdateUserAdminCommand, UpdateUserAdminResponse>
{
    public async Task<Result<UpdateUserAdminResponse>> Handle(
        UpdateUserAdminCommand request,
        CancellationToken cancellationToken)
    {
        var isWildcardAdmin = currentUser.HasPermission("*");

        // ── Load target user (tracked) ───────────────────────────────────────
        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId && !u.IsDeleted, cancellationToken);
        if (user is null)
            return Error.NotFound("User.NotFound", $"User {request.UserId} not found.");

        // ── Resolve the user's current scope from their role assignment ───────
        var platformRole = await db.UserRoles
            .FirstOrDefaultAsync(ur => ur.UserId == user.Id && ur.IsActive && ur.DeletedAt == null, cancellationToken);

        OrganizationMember? orgMember = null;
        string scope;
        Guid? targetOrgId = null;

        if (platformRole is not null)
        {
            scope = "platform";
        }
        else
        {
            orgMember = await db.OrganizationMembers
                .FirstOrDefaultAsync(m => m.UserId == user.Id && m.IsActive && m.DeletedAt == null, cancellationToken);
            if (orgMember is null)
                return Error.Conflict("User.NoRoleAssignment",
                    "User has no active role assignment to edit. Re-create the assignment first.");

            scope = "org";
            targetOrgId = orgMember.OrganizationId;
        }

        // ── Org-scope guard for non-wildcard callers ──────────────────────────
        if (scope == "org" && !isWildcardAdmin)
        {
            var (guardedOrgId, orgFailure) = await OrgContextGuard.ValidateAsync(
                db, currentUser, requireMembership: true, cancellationToken);
            if (orgFailure is not null)
                return orgFailure;

            if (guardedOrgId != targetOrgId)
                return Error.Forbidden(
                    "User.OrgMismatch",
                    "You can only edit users in your own organization.");
        }

        // ── Resolve the (possibly new) target role ────────────────────────────
        var role = await db.Roles
            .Include(r => r.Permissions).ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r => r.Id == request.RoleId && r.DeletedAt == null, cancellationToken);
        if (role is null)
            return Error.NotFound("Role", request.RoleId);

        // I1.3-001: WILDCARD ONLY gate for system/platform-role assignment.
        if (!isWildcardAdmin && role.IsSystemRole && role.OrganizationId is null)
            return Error.Forbidden(
                "User.PrivilegeEscalation",
                "You cannot assign a platform/system role. Only a wildcard SUPER_ADMIN may do so.");

        // ── Delegation: resolve caller effective set once ─────────────────────
        HashSet<string>? callerEffective = null;
        if (!isWildcardAdmin)
        {
            callerEffective = await EffectivePermissionResolver.ResolveAsync(
                db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);
            callerEffective.UnionWith(currentUser.Permissions.Where(p => p != "*"));

            var rolePermNames = role.Permissions
                .Where(rp => rp.DeletedAt == null && rp.Permission?.IsActive == true)
                .Select(rp => rp.Permission!.Name)
                .ToList();

            var notGrantable = rolePermNames.Except(callerEffective, StringComparer.OrdinalIgnoreCase).ToList();
            if (notGrantable.Count > 0)
                return Error.Forbidden(
                    "Role.PrivilegeEscalation",
                    $"You cannot assign a role containing permissions you do not hold: " +
                    $"{string.Join(", ", notGrantable.Take(5))}");
        }

        // ── Resolve + validate override permissions ───────────────────────────
        List<Permission> overridePerms = [];
        if (request.PermissionIds?.Count > 0)
        {
            var distinctIds = request.PermissionIds.Distinct().ToList();
            overridePerms = await db.Permissions
                .Where(p => distinctIds.Contains(p.Id) && p.IsActive && p.DeletedAt == null)
                .ToListAsync(cancellationToken);

            if (overridePerms.Count != distinctIds.Count)
            {
                var missing = distinctIds.Except(overridePerms.Select(p => p.Id));
                return Error.Validation("User.InvalidPermissions",
                    $"Permission IDs not found: {string.Join(", ", missing)}");
            }

            if (!isWildcardAdmin)
            {
                var notGrantable = overridePerms
                    .Select(p => p.Name)
                    .Except(callerEffective!, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (notGrantable.Count > 0)
                    return Error.Forbidden(
                        "Role.PrivilegeEscalation",
                        $"You cannot grant override permissions you do not hold: " +
                        $"{string.Join(", ", notGrantable.Take(5))}");
            }
        }

        // ── Resolve deny overrides (restrictive → no delegation check needed) ──────
        List<Permission> denyPerms = [];
        if (request.DeniedPermissionIds?.Count > 0)
        {
            var distinctDeny = request.DeniedPermissionIds.Distinct().ToList();
            denyPerms = await db.Permissions
                .Where(p => distinctDeny.Contains(p.Id) && p.IsActive && p.DeletedAt == null)
                .ToListAsync(cancellationToken);

            if (denyPerms.Count != distinctDeny.Count)
            {
                var missing = distinctDeny.Except(denyPerms.Select(p => p.Id));
                return Error.Validation("User.InvalidPermissions",
                    $"Permission IDs not found: {string.Join(", ", missing)}");
            }
        }

        // ── Apply user-level changes ───────────────────────────────────────────
        user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.PreferredLanguage))
            user.PreferredLanguage = request.PreferredLanguage!.Trim();
        if (user.IsActive != request.IsActive)
            user.SetActive(request.IsActive);

        // ── Apply profile changes ──────────────────────────────────────────────
        var profileInput = request.Profile;
        if (profileInput is not null || !string.IsNullOrWhiteSpace(request.UserType))
        {
            var profile = await db.UserProfiles
                .FirstOrDefaultAsync(p => p.UserId == user.Id && p.DeletedAt == null, cancellationToken);

            if (profile is null)
            {
                profile = new UserProfile { UserId = user.Id };
                db.UserProfiles.Add(profile);
            }

            if (!string.IsNullOrWhiteSpace(request.UserType))
                profile.SetUserType(request.UserType!.Trim());

            if (profileInput is not null)
            {
                profile.AadhaarLast4 = profileInput.AadhaarLast4;
                profile.DateOfBirth  = profileInput.DateOfBirth;
                profile.Gender       = profileInput.Gender;
                profile.AddressLine1 = profileInput.AddressLine1;
                profile.AddressLine2 = profileInput.AddressLine2;
                profile.City         = profileInput.City;
                profile.State        = profileInput.State;
                profile.Pincode      = profileInput.Pincode;
                if (!string.IsNullOrWhiteSpace(profileInput.Country))
                    profile.SetCountry(profileInput.Country!.Trim());

                // SEC-013: only re-encrypt when a fresh PAN is supplied; blank keeps existing.
                if (!string.IsNullOrWhiteSpace(profileInput.PanNumber))
                    profile.PanNumber = panEncryption.Encrypt(
                        profileInput.PanNumber!.Trim().ToUpperInvariant());
            }
        }

        // ── Apply role change ───────────────────────────────────────────────────
        if (scope == "platform")
        {
            if (platformRole!.RoleId != role.Id)
            {
                platformRole.Deactivate();
                db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
            }
        }
        else // org
        {
            if (orgMember!.RoleId != role.Id)
                orgMember.AssignRole(role.Id);
        }

        // ── Reconcile permission overrides (allow + deny, replace set) ──────────
        var existingOverrides = await db.UserPermissions
            .Where(up => up.UserId == user.Id && up.DeletedAt == null)
            .ToListAsync(cancellationToken);

        // permId → isAllowed (allow override = true, deny override = false). Anything
        // not in this map is removed (the user inherits the role's decision).
        var desired = new Dictionary<Guid, bool>();
        foreach (var p in denyPerms) desired[p.Id] = false;
        foreach (var p in overridePerms) desired[p.Id] = true; // validator forbids overlap
        var existingByPerm = existingOverrides.ToDictionary(up => up.PermissionId);

        // Soft-delete overrides no longer desired.
        foreach (var up in existingOverrides.Where(up => !desired.ContainsKey(up.PermissionId)))
            up.DeletedAt = DateTime.UtcNow;

        // Add new / flip existing overrides to the desired allow|deny state.
        foreach (var (permId, isAllowed) in desired)
        {
            if (existingByPerm.TryGetValue(permId, out var up))
            {
                if (up.IsAllowed != isAllowed) up.SetAllowed(isAllowed);
            }
            else
            {
                db.UserPermissions.Add(UserPermission.Create(
                    userId:          user.Id,
                    permissionId:    permId,
                    organizationId:  targetOrgId,   // NULL for platform scope
                    grantedByUserId: currentUser.UserId,
                    isAllowed:       isAllowed));
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return new UpdateUserAdminResponse(
            user.Id,
            scope,
            role.Id,
            overridePerms.Select(p => p.Name).OrderBy(n => n).ToList());
    }
}
