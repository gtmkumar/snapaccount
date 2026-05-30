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

namespace AuthService.Application.Admin.Commands.CreateUserAdmin;

/// <summary>
/// Creates a new user account with role + optional direct permission overrides.
///
/// scope = "platform" → assign a platform role (UserRole).
/// scope = "org"      → assign an org-scoped role (OrganizationMember).
///
/// DELEGATION (CRITICAL — I1.3-001):
///   • Assigning a SYSTEM or platform-scoped role (IsSystemRole=true, OrganizationId=null)
///     requires the caller to hold the "*" wildcard permission. Holding
///     platform.admins.invite alone is NOT sufficient — that permission only gates
///     access to the endpoint, not the system-role assignment. This prevents a holder
///     of platform.admins.invite (grantable by SUPER_ADMIN via user_permission) from
///     bootstrapping SUPER_ADMIN accounts without true wildcard authority.
///   • Role perms ⊆ caller's effective set (else 403 Role.PrivilegeEscalation)
///   • Override permissionIds ⊆ caller's effective set (else 403)
/// </summary>
[RequiresPermission(Permissions.PlatformAdminsInvite)]
public record CreateUserAdminCommand(
    string FullName,
    string Email,
    string? PhoneNumber,
    string Scope,
    Guid RoleId,
    Guid? OrganizationId,
    IReadOnlyList<Guid>? PermissionIds,
    string? InitialPassword,
    string? PreferredLanguage = null,
    string? UserType = null,
    bool IsActive = true,
    UserProfileInput? Profile = null) : ICommand<CreateUserAdminResponse>;

/// <summary>Optional profile/KYC fields captured at admin user creation/edit.</summary>
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

/// <summary>Response returned on successful user creation.</summary>
public record CreateUserAdminResponse(
    Guid UserId,
    string Email,
    string Scope,
    Guid RoleId,
    IReadOnlyList<string> GrantedPermissions);

public sealed class CreateUserAdminCommandValidator : AbstractValidator<CreateUserAdminCommand>
{
    public CreateUserAdminCommandValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(300);

        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress().WithMessage("A valid email address is required.")
            .MaximumLength(320);

        When(x => x.PhoneNumber is not null, () =>
            RuleFor(x => x.PhoneNumber!)
                .Matches(@"^\+[1-9]\d{6,14}$")
                .WithMessage("Phone must be E.164 format (e.g. +919876543210)."));

        RuleFor(x => x.Scope)
            .NotEmpty()
            .Must(s => s is "platform" or "org")
            .WithMessage("Scope must be 'platform' or 'org'.");

        RuleFor(x => x.RoleId).NotEmpty();

        When(x => x.Scope == "org", () =>
            RuleFor(x => x.OrganizationId)
                .NotEmpty().WithMessage("OrganizationId is required when scope=org."));

        RuleFor(x => x.PermissionIds)
            .Must(ids => ids == null || ids.Count <= 100)
            .WithMessage("Cannot assign more than 100 direct permission overrides.");

        RuleFor(x => x.InitialPassword)
            .MinimumLength(8).WithMessage("Initial password must be at least 8 characters.")
            .When(x => x.InitialPassword is not null);

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

public sealed class CreateUserAdminCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IPasswordHasher hasher,
    IPanEncryptionService panEncryption)
    : ICommandHandler<CreateUserAdminCommand, CreateUserAdminResponse>
{

    public async Task<Result<CreateUserAdminResponse>> Handle(
        CreateUserAdminCommand request,
        CancellationToken cancellationToken)
    {
        // I1.3-001: wildcard-only flag for system-role assignment gate.
        // platform.admins.invite grants access to this endpoint (via [RequiresPermission])
        // but must NOT be treated as equivalent to the "*" wildcard for the purpose of
        // assigning platform/system roles — that would allow a holder of the granted
        // permission to bootstrap SUPER_ADMIN accounts.
        var isWildcardAdmin = currentUser.HasPermission("*");

        // ── Org-scope guard ───────────────────────────────────────────────────
        Guid? targetOrgId = null;
        if (request.Scope == "org")
        {
            if (!request.OrganizationId.HasValue)
                return Error.Validation("User.OrgRequired", "OrganizationId is required for scope=org.");

            // Wildcard SUPER_ADMIN can create users in any org; others only in their own
            if (!isWildcardAdmin)
            {
                var (guardedOrgId, orgFailure) = await OrgContextGuard.ValidateAsync(
                    db, currentUser, requireMembership: true, cancellationToken);
                if (orgFailure is not null)
                    return orgFailure;

                if (guardedOrgId != request.OrganizationId.Value)
                    return Error.Forbidden(
                        "User.OrgMismatch",
                        "You can only create users in your own organization.");
            }

            targetOrgId = request.OrganizationId.Value;
        }

        // ── Unique email/phone guard ──────────────────────────────────────────
        var emailLower = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email != null && u.Email.ToLower() == emailLower, cancellationToken))
            return Error.Conflict("User.EmailConflict", $"A user with email '{request.Email}' already exists.");

        if (request.PhoneNumber is not null &&
            await db.Users.AnyAsync(u => u.PhoneNumber == request.PhoneNumber, cancellationToken))
            return Error.Conflict("User.PhoneConflict", $"A user with phone '{request.PhoneNumber}' already exists.");

        // ── Resolve target role ───────────────────────────────────────────────
        var role = await db.Roles
            .Include(r => r.Permissions).ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r => r.Id == request.RoleId && r.DeletedAt == null, cancellationToken);

        if (role is null)
            return Error.NotFound("Role", request.RoleId);

        // I1.3-001: WILDCARD ONLY gate for system/platform-role assignment.
        // Holding platform.admins.invite does NOT bypass this — only "*" does.
        if (!isWildcardAdmin && role.IsSystemRole && role.OrganizationId is null)
            return Error.Forbidden(
                "User.PrivilegeEscalation",
                "You cannot assign a platform/system role. Only a wildcard SUPER_ADMIN may do so.");

        // ── Delegation check: role perms ⊆ caller's effective set ─────────────
        if (!isWildcardAdmin)
        {
            var callerEffective = await EffectivePermissionResolver.ResolveAsync(
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

        // ── Resolve override permissions + delegation check ───────────────────
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
                var callerEffective = await EffectivePermissionResolver.ResolveAsync(
                    db, currentUser.UserId, currentUser.OrganizationId, cancellationToken);
                callerEffective.UnionWith(currentUser.Permissions.Where(p => p != "*"));

                var notGrantable = overridePerms
                    .Select(p => p.Name)
                    .Except(callerEffective, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (notGrantable.Count > 0)
                    return Error.Forbidden(
                        "Role.PrivilegeEscalation",
                        $"You cannot grant override permissions you do not hold: " +
                        $"{string.Join(", ", notGrantable.Take(5))}");
            }
        }

        // ── Create User ───────────────────────────────────────────────────────
        var newUser = new User
        {
            Email           = request.Email.Trim(),
            FullName        = request.FullName.Trim(),
            PhoneNumber     = request.PhoneNumber?.Trim(),
            PreferredLanguage = string.IsNullOrWhiteSpace(request.PreferredLanguage) ? "en" : request.PreferredLanguage!.Trim(),
        };
        if (!request.IsActive) newUser.SetActive(false);

        // Set password only in LOCAL_AUTH mode (dev sets it as an env var) and when provided.
        // IConfiguration is intentionally NOT referenced from the Application layer.
        if (request.InitialPassword is not null)
        {
            var localAuthEnabled =
                Environment.GetEnvironmentVariable("LOCAL_AUTH")
                    ?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;

            if (localAuthEnabled)
                newUser.SetPasswordHash(hasher.Hash(request.InitialPassword));
        }

        db.Users.Add(newUser);

        // Create UserProfile + UserPreference
        var profileInput = request.Profile;
        var profile = new UserProfile
        {
            UserId       = newUser.Id,
            AadhaarLast4 = profileInput?.AadhaarLast4,
            DateOfBirth  = profileInput?.DateOfBirth,
            Gender       = profileInput?.Gender,
            AddressLine1 = profileInput?.AddressLine1,
            AddressLine2 = profileInput?.AddressLine2,
            City         = profileInput?.City,
            State        = profileInput?.State,
            Pincode      = profileInput?.Pincode,
            // SEC-013: PAN stored AES-256 encrypted, never plaintext.
            PanNumber    = string.IsNullOrWhiteSpace(profileInput?.PanNumber)
                ? null
                : panEncryption.Encrypt(profileInput!.PanNumber!.Trim().ToUpperInvariant()),
        };
        profile.SetUserType(
            !string.IsNullOrWhiteSpace(request.UserType)
                ? request.UserType!.Trim()
                : (request.Scope == "platform" ? "STAFF" : "EMPLOYEE"));
        if (!string.IsNullOrWhiteSpace(profileInput?.Country))
            profile.SetCountry(profileInput!.Country!.Trim());
        db.UserProfiles.Add(profile);
        db.UserPreferences.Add(new UserPreference { UserId = newUser.Id });

        await db.SaveChangesAsync(cancellationToken);

        // ── Assign role ───────────────────────────────────────────────────────
        if (request.Scope == "platform")
        {
            db.UserRoles.Add(UserRole.Create(newUser.Id, role.Id));
        }
        else
        {
            db.OrganizationMembers.Add(
                OrganizationMember.Create(targetOrgId!.Value, newUser.Id, role.Id));
        }

        // ── Insert direct permission overrides ────────────────────────────────
        foreach (var perm in overridePerms)
        {
            db.UserPermissions.Add(UserPermission.Create(
                userId:         newUser.Id,
                permissionId:   perm.Id,
                organizationId: targetOrgId,      // NULL for platform scope
                grantedByUserId: currentUser.UserId));
        }

        await db.SaveChangesAsync(cancellationToken);

        return new CreateUserAdminResponse(
            newUser.Id,
            newUser.Email!,
            request.Scope,
            role.Id,
            overridePerms.Select(p => p.Name).OrderBy(n => n).ToList());
    }
}
