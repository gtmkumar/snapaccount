using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetUserDetail;

/// <summary>
/// Returns a single user's profile + their primary organization business
/// profile for the admin per-user detail page. SUPER_ADMIN only.
///
/// Phase B (1.4): extended for the Edit User dialog prefill — now also returns
/// userType, the user's role assignment (roleId + scope + org), direct
/// permission overrides, and the full KYC profile. PAN is returned MASKED only
/// (SEC-013) — the encrypted value is never decrypted to the wire in full.
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
    string? UserType,
    DateTime JoinedAt,
    // ── Role assignment (for edit prefill) ──────────────────────────────────
    Guid? RoleId,
    string? RoleScope,           // "platform" | "org" | null (no role)
    Guid? RoleOrganizationId,    // set when RoleScope == "org"
    IReadOnlyList<Guid> OverridePermissionIds,
    // ── KYC / personal profile (for edit prefill) ───────────────────────────
    UserProfileDto? Profile,
    // ── Primary owned organisation (existing detail-page widget) ─────────────
    UserBusinessProfileDto? Business);

/// <summary>Personal KYC profile. PAN is masked; never the full decrypted value.</summary>
public record UserProfileDto(
    string? PanMasked,
    string? AadhaarLast4,
    DateOnly? DateOfBirth,
    string? Gender,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? Pincode,
    string? Country);

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

public sealed class GetUserDetailQueryHandler(IAuthDbContext db, IPanEncryptionService panEncryption)
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

        // ── Personal profile (PAN masked) ───────────────────────────────────
        var profileRow = await db.UserProfiles
            .Where(p => p.UserId == request.UserId && p.DeletedAt == null)
            .Select(p => new
            {
                p.UserType, p.PanNumber, p.AadhaarLast4, p.DateOfBirth, p.Gender,
                p.AddressLine1, p.AddressLine2, p.City, p.State, p.Pincode, p.Country,
            })
            .FirstOrDefaultAsync(ct);

        UserProfileDto? profile = profileRow is null
            ? null
            : new UserProfileDto(
                MaskPan(profileRow.PanNumber),
                profileRow.AadhaarLast4,
                profileRow.DateOfBirth,
                profileRow.Gender,
                profileRow.AddressLine1,
                profileRow.AddressLine2,
                profileRow.City,
                profileRow.State,
                profileRow.Pincode,
                profileRow.Country);

        // ── Role assignment — prefer a platform role, else org membership ────
        Guid? roleId = null;
        string? roleScope = null;
        Guid? roleOrgId = null;

        var platformRole = await db.UserRoles
            .Where(ur => ur.UserId == request.UserId && ur.IsActive && ur.DeletedAt == null)
            .OrderBy(ur => ur.CreatedAt)
            .Select(ur => (Guid?)ur.RoleId)
            .FirstOrDefaultAsync(ct);

        if (platformRole.HasValue)
        {
            roleId = platformRole;
            roleScope = "platform";
        }
        else
        {
            var orgMembership = await db.OrganizationMembers
                .Where(m => m.UserId == request.UserId && m.IsActive && m.DeletedAt == null)
                .OrderBy(m => m.JoinedAt)
                .Select(m => new { m.RoleId, m.OrganizationId })
                .FirstOrDefaultAsync(ct);

            if (orgMembership is not null)
            {
                roleId = orgMembership.RoleId;
                roleScope = "org";
                roleOrgId = orgMembership.OrganizationId;
            }
        }

        // ── Direct permission overrides (active grants) ──────────────────────
        var overrideIds = await db.UserPermissions
            .Where(up => up.UserId == request.UserId && up.DeletedAt == null)
            .Select(up => up.PermissionId)
            .Distinct()
            .ToListAsync(ct);

        // Primary organization (user's first owned org if any).
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
            profileRow?.UserType,
            user.CreatedAt,
            roleId,
            roleScope,
            roleOrgId,
            overrideIds,
            profile,
            business);
    }

    /// <summary>
    /// SEC-013: never return the full PAN. Decrypts the stored ciphertext and
    /// returns a masked form (first 5 chars + asterisks) — e.g. "ABCDE****X".
    /// Defensive: any decrypt failure (legacy/plaintext rows) yields a generic mask.
    /// </summary>
    private string? MaskPan(string? encryptedPan)
    {
        if (string.IsNullOrWhiteSpace(encryptedPan)) return null;
        try
        {
            var plain = panEncryption.Decrypt(encryptedPan);
            if (plain.Length != 10) return "••••••••••";
            return $"{plain[..5]}****{plain[^1]}";
        }
        catch
        {
            return "••••••••••";
        }
    }
}
