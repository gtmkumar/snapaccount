namespace SnapAccount.Shared.Application;

public interface ICurrentUser
{
    Guid UserId { get; }
    Guid? OrganizationId { get; }
    IReadOnlyList<string> Roles { get; }
    bool IsAuthenticated { get; }
    string? FirebaseUid { get; }
    string? PhoneNumber { get; }
    string? Email { get; }

    bool IsInRole(string role);
    bool HasPermission(string permission);
}
