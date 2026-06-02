namespace AuthService.Domain;

/// <summary>
/// Centralised permission constant definitions for the Auth/RBAC module.
/// Use these constants everywhere — never hardcode permission strings.
///
/// Naming convention: {resource}.{action}
/// Resources map to DB permission.resource column; actions to permission.action.
/// </summary>
public static class Permissions
{
    // ── Org Members ─────────────────────────────────────────────────────────
    public const string OrgMembersRead     = "org.members.read";
    public const string OrgMembersInvite   = "org.members.invite";
    public const string OrgMembersUpdate   = "org.members.update";
    public const string OrgMembersRemove   = "org.members.remove";
    public const string OrgMembersSuspend  = "org.members.suspend";

    // ── Org Roles ────────────────────────────────────────────────────────────
    public const string OrgRolesRead    = "org.roles.read";
    public const string OrgRolesCreate  = "org.roles.create";
    public const string OrgRolesUpdate  = "org.roles.update";
    public const string OrgRolesDelete  = "org.roles.delete";
    public const string OrgRolesAssign  = "org.roles.assign";

    // ── Org Permissions ──────────────────────────────────────────────────────
    public const string OrgPermissionsRead  = "org.permissions.read";
    public const string OrgPermissionsGrant = "org.permissions.grant";

    // ── Org Settings ─────────────────────────────────────────────────────────
    public const string OrgSettingsRead   = "org.settings.read";
    public const string OrgSettingsUpdate = "org.settings.update";

    // ── Platform (SUPER_ADMIN only) ──────────────────────────────────────────
    public const string PlatformOrgsRead        = "platform.orgs.read";
    public const string PlatformOrgsCreate      = "platform.orgs.create";
    public const string PlatformOrgsSuspend     = "platform.orgs.suspend";
    public const string PlatformAdminsInvite    = "platform.admins.invite";
    public const string PlatformRolesManage     = "platform.roles.manage";
    public const string PlatformPermissionsManage = "platform.permissions.manage";
    public const string PlatformRefDataManage     = "platform.refdata.manage";
    public const string PlatformAiManage          = "platform.ai.manage";
}
