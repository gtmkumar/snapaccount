using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Application.Common.Helpers;

/// <summary>
/// Centralised effective-permission resolver — single source of truth for the union:
///   platform-role perms  (auth.user_role → role_permission → permission)
///   ∪ org-member-role perms (auth.organization_member → role_permission → permission)
///   ∪ direct user_permission grants (auth.user_permission WHERE org_id IS NULL OR = activeOrg)
///
/// All three legs filter: permission.is_active = true AND permission.deleted_at IS NULL.
///
/// Increment 1.3: direct user_permission grants (migration 038) added to all call-sites.
/// Previously only role-based expansion was performed; that meant a user with a direct
/// grant but no matching role grant would see nothing in GET /auth/me/permissions.
/// </summary>
public static class EffectivePermissionResolver
{
    /// <summary>
    /// Returns the set of live permission names for <paramref name="userId"/> within
    /// the given <paramref name="activeOrgId"/> context.
    ///
    /// <paramref name="activeOrgId"/> null = platform context (only NULL-scope grants apply).
    /// </summary>
    public static async Task<HashSet<string>> ResolveAsync(
        IAuthDbContext db,
        Guid userId,
        Guid? activeOrgId,
        CancellationToken ct)
    {
        // ── Leg 1: platform-role perms (UserRole → RolePermission → Permission) ────
        var platformPerms = await db.UserRoles
            .Where(ur => ur.UserId == userId && ur.IsActive && ur.DeletedAt == null)
            .Join(db.RolePermissions.Where(rp => rp.DeletedAt == null),
                ur => ur.RoleId, rp => rp.RoleId, (_, rp) => rp.PermissionId)
            .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                permId => permId, p => p.Id, (_, p) => p.Name)
            .ToListAsync(ct);

        // ── Leg 2: org-membership-role perms (OrgMember → RolePermission → Permission) ─
        List<string> orgRolePerms = [];
        if (activeOrgId.HasValue)
        {
            orgRolePerms = await db.OrganizationMembers
                .Where(m => m.UserId == userId && m.OrganizationId == activeOrgId.Value
                         && m.IsActive && m.DeletedAt == null)
                .Join(db.RolePermissions.Where(rp => rp.DeletedAt == null),
                    m => m.RoleId, rp => rp.RoleId, (_, rp) => rp.PermissionId)
                .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                    permId => permId, p => p.Id, (_, p) => p.Name)
                .ToListAsync(ct);
        }

        // ── Leg 3: direct user_permission grants (migration 038) ─────────────────────
        // Platform grants: organization_id IS NULL
        // Org grants:      organization_id = activeOrgId (when in org context)
        var directPerms = await db.UserPermissions
            .Where(up =>
                up.UserId == userId &&
                up.DeletedAt == null &&
                (up.OrganizationId == null ||
                 (activeOrgId.HasValue && up.OrganizationId == activeOrgId.Value)))
            .Join(db.Permissions.Where(p => p.IsActive && p.DeletedAt == null),
                up => up.PermissionId, p => p.Id, (_, p) => p.Name)
            .ToListAsync(ct);

        return [.. platformPerms, .. orgRolePerms, .. directPerms];
    }
}
