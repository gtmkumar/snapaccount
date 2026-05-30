namespace SnapAccount.Shared.Application;

public interface ICurrentUser
{
    Guid UserId { get; }
    Guid? OrganizationId { get; }
    IReadOnlyList<string> Roles { get; }

    /// <summary>
    /// Explicit permission codes held by this user (from JWT claims or DB expansion).
    /// A single "*" entry means the user holds all permissions (dev super-admin).
    /// </summary>
    IReadOnlyList<string> Permissions { get; }

    bool IsAuthenticated { get; }
    string? FirebaseUid { get; }
    string? PhoneNumber { get; }
    string? Email { get; }

    bool IsInRole(string role);
    bool HasPermission(string permission);
}
