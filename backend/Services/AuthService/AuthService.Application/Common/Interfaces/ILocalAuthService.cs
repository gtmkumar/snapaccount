namespace AuthService.Application.Common.Interfaces;

/// <summary>
/// LOCAL_AUTH dev login: verifies a username/password against the local database and
/// issues a locally-signed JWT. NEVER used in staging/production (which use Firebase).
/// </summary>
public interface ILocalAuthService
{
    /// <summary>Verifies credentials and returns a signed token + identity, or null if invalid.</summary>
    Task<LocalLoginResult?> LoginAsync(string email, string password, CancellationToken ct);

    /// <summary>Idempotently ensures a dev admin user exists with a known password.</summary>
    Task EnsureDevAdminAsync(CancellationToken ct);
}

public sealed record LocalLoginResult(
    string AccessToken,
    Guid UserId,
    string Email,
    string? FullName,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions);
