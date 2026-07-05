using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Application.Common.Helpers;

/// <summary>
/// Centralised effective-permission resolver — the single source of truth consumed
/// by the login token, <c>PermissionBehavior</c>, <c>GET /auth/me/permissions</c>,
/// the navigation menu, and the delegation/grantable checks.
///
/// Legs gathered (each filtered to live permissions: is_active = true AND deleted_at IS NULL):
///   1. platform-role grants  (auth.user_role → role_permission → permission)
///   2. org-member-role grants (auth.organization_member → role_permission → permission)
///   3. direct user_permission grants (auth.user_permission, org-scoped)
///
/// Allow/Deny (migration 043, gap #2): each grant carries <c>is_allowed</c>. The
/// effective set is <b>(all allows) MINUS (all denies)</b> — deny wins globally
/// across roles and direct grants. A deny is subtractive over concrete permission
/// names; it does NOT constrain the <c>*</c> wildcard (super-admins stay
/// unconstrained by design). Pre-043 rows default to allow, so behaviour is
/// unchanged until a deny row is authored.
/// </summary>
public static class EffectivePermissionResolver
{
    private sealed record Grant(string Name, bool IsAllowed);

    /// <summary>
    /// Returns the set of live, net-allowed permission names for <paramref name="userId"/>
    /// within the given <paramref name="activeOrgId"/> context.
    /// <paramref name="activeOrgId"/> null = platform context (only NULL-scope grants apply).
    /// </summary>
    public static async Task<HashSet<string>> ResolveAsync(
        IAuthDbContext db,
        Guid userId,
        Guid? activeOrgId,
        CancellationToken ct)
    {
        // ── Leg 1: platform-role grants (UserRole → RolePermission → Permission) ────
        var platformGrants = await db.UserRoles
            .Where(ur => ur.UserId == userId && ur.IsActive && ur.DeletedAt == null)
            .Join(db.RolePermissions.Where(rp => rp.DeletedAt == null),
                ur => ur.RoleId, rp => rp.RoleId, (_, rp) => rp)
            .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                rp => rp.PermissionId, p => p.Id, (rp, p) => new Grant(p.Name, rp.IsAllowed))
            .ToListAsync(ct);

        // ── Leg 2: org-membership-role grants (OrgMember → RolePermission → Permission) ─
        List<Grant> orgGrants = [];
        if (activeOrgId.HasValue)
        {
            orgGrants = await db.OrganizationMembers
                .Where(m => m.UserId == userId && m.OrganizationId == activeOrgId.Value
                         && m.IsActive && m.DeletedAt == null)
                .Join(db.RolePermissions.Where(rp => rp.DeletedAt == null),
                    m => m.RoleId, rp => rp.RoleId, (_, rp) => rp)
                .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                    rp => rp.PermissionId, p => p.Id, (rp, p) => new Grant(p.Name, rp.IsAllowed))
                .ToListAsync(ct);
        }

        // ── Leg 3: direct user_permission grants (migration 038 + 043) ───────────────
        // Platform grants: organization_id IS NULL; org grants: = activeOrgId in org context.
        var directGrants = await db.UserPermissions
            .Where(up =>
                up.UserId == userId &&
                up.DeletedAt == null &&
                (up.OrganizationId == null ||
                 (activeOrgId.HasValue && up.OrganizationId == activeOrgId.Value)))
            .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                up => up.PermissionId, p => p.Id, (up, p) => new Grant(p.Name, up.IsAllowed))
            .ToListAsync(ct);

        // ── Net = allows − denies (deny wins globally) ───────────────────────────────
        var all = platformGrants.Concat(orgGrants).Concat(directGrants);
        var denied = all.Where(g => !g.IsAllowed).Select(g => g.Name).ToHashSet();
        return all
            .Where(g => g.IsAllowed && !denied.Contains(g.Name))
            .Select(g => g.Name)
            .ToHashSet();
    }
}
