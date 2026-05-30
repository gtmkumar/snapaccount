using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A direct permission grant on a single user — independent of role-based grants.
/// These are "override" grants that augment (or later, restrict) what a user can do
/// beyond what their role implies.
///
/// Scope:
///   OrganizationId IS NULL      → platform-level grant (visible across all orgs)
///   OrganizationId IS NOT NULL  → org-scoped grant (active only when the user
///                                  is operating in that specific org)
///
/// Migration 038 unique partial index:
///   (user_id, permission_id, COALESCE(organization_id, '00000000-...')) WHERE deleted_at IS NULL
/// </summary>
public class UserPermission : BaseAuditableEntity
{
    /// <summary>User this grant belongs to.</summary>
    public Guid UserId { get; private set; }

    /// <summary>The permission being granted.</summary>
    public Guid PermissionId { get; private set; }

    /// <summary>
    /// NULL = platform-level grant.
    /// Non-NULL = org-scoped: only active when the user's JWT carries this org id.
    /// </summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>User who created this grant (for audit trail).</summary>
    public Guid GrantedByUserId { get; private set; }

    // Navigation
    public Permission? Permission { get; private set; }

    private UserPermission() { }

    /// <summary>Creates a new direct permission grant.</summary>
    public static UserPermission Create(
        Guid userId,
        Guid permissionId,
        Guid? organizationId,
        Guid grantedByUserId)
        => new()
        {
            UserId          = userId,
            PermissionId    = permissionId,
            OrganizationId  = organizationId,
            GrantedByUserId = grantedByUserId,
        };
}
