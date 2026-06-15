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

/// <summary>
/// Result of a LOCAL_AUTH login attempt.
/// When <see cref="Requires2fa"/> is true, the caller must complete
/// POST /auth/2fa/challenge with the <see cref="ChallengeToken"/> to obtain the JWT.
/// </summary>
public sealed record LocalLoginResult(
    string Token,
    Guid UserId,
    string Email,
    string? FullName,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    bool Requires2fa = false,
    string? ChallengeToken = null);
