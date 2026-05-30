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
}
