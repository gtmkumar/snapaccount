namespace AuthService.Application.Common.DevSeed;

/// <summary>
/// Shared constants for the LOCAL_AUTH dev seed so both <c>LocalAuthService</c>
/// (Infrastructure) and unit tests (which cannot reference Infrastructure) can
/// agree on the exact values without duplication.
///
/// NEVER used in staging or production — LOCAL_AUTH is disabled in those environments.
/// </summary>
public static class LocalAuthDevSeed
{
    /// <summary>
    /// Fixed dev org UUID seeded on every LOCAL_AUTH startup.
    /// Non-zero so FK constraints on auth.organization are satisfied.
    /// </summary>
    public static readonly Guid DevOrgId = new("11111111-1111-1111-1111-111111111111");

    /// <summary>
    /// The exact permission names seeded onto the DEV_LIMITED_MANAGER custom org role.
    /// These are what the browser matrix shows as grantable when logged in as
    /// manager@snapaccount.local — all other permissions render greyed.
    /// </summary>
    public static readonly IReadOnlyList<string> ManagerPermissions =
    [
        "org.roles.read",
        "org.roles.create",
        "org.roles.update",
        "org.permissions.read",
        "org.permissions.grant",
        "gst.returns.file",
        "document.read",
    ];

    /// <summary>
    /// Shared password for the per-role E2E campaign logins (all <see cref="RoleAccounts"/>).
    /// Distinct from the admin/manager passwords so the docs can hand testers one value.
    /// </summary>
    public const string SharedPassword = "Test@12345";

    /// <summary>
    /// A single LOCAL_AUTH login per admin-relevant system role, used by the role-by-role
    /// E2E test campaign. Each references a migration-seeded system role by name
    /// (migrations 036/039/041) — the seed NEVER creates roles, it only assigns existing ones.
    /// </summary>
    /// <param name="Email">Login email (also the natural key the seed guards on).</param>
    /// <param name="FullName">Display name stored on the user row.</param>
    /// <param name="RoleName">Migration-seeded system-role name to assign.</param>
    /// <param name="IsStaffRole">
    /// <c>true</c> → platform staff role assigned via <c>auth.user_role</c> (surfaces in the
    /// admin staff list + JWT roles claim, permissions resolved from the platform-role leg).
    /// <c>false</c> → org-member role assigned via <c>auth.organization_member</c> in the dev org
    /// (permissions resolved from the org-membership leg).
    /// </param>
    public sealed record DevRoleAccount(string Email, string FullName, string RoleName, bool IsStaffRole);

    /// <summary>
    /// The nine per-role dev logins. Classification mirrors the production convention:
    /// <c>GetStaffListQuery</c> reads staff from <c>auth.user_role</c>, while ORG_ADMIN /
    /// MANAGER / HR / REVIEWER are customer-org roles held via <c>auth.organization_member</c>.
    /// All share <see cref="SharedPassword"/>.
    /// </summary>
    public static readonly IReadOnlyList<DevRoleAccount> RoleAccounts =
    [
        // ── Platform staff roles → auth.user_role (admin-panel accessible) ────────────
        new("ops@snapaccount.local",       "Dev Operations Manager", "OPERATIONS_MANAGER",  IsStaffRole: true),
        new("support@snapaccount.local",   "Dev Support Executive",  "SUPPORT_EXECUTIVE",   IsStaffRole: true),
        new("dataentry@snapaccount.local", "Dev Data Entry",         "DATA_ENTRY_OPERATOR", IsStaffRole: true),
        new("bankrep@snapaccount.local",   "Dev Partner Bank Rep",   "PARTNER_BANK_REP",    IsStaffRole: true),
        new("ca@snapaccount.local",        "Dev Chartered Accountant", "CA",                IsStaffRole: true),
        // ── Org-member roles → auth.organization_member in the dev org ────────────────
        new("orgadmin@snapaccount.local",  "Dev Org Admin",          "ORG_ADMIN",  IsStaffRole: false),
        new("manager2@snapaccount.local",  "Dev Org Manager",        "MANAGER",    IsStaffRole: false),
        new("hr@snapaccount.local",        "Dev HR",                 "HR",         IsStaffRole: false),
        new("reviewer@snapaccount.local",  "Dev Reviewer",           "REVIEWER",   IsStaffRole: false),
    ];
}
