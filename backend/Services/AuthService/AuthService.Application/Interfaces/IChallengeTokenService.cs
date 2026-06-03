namespace AuthService.Application.Interfaces;

/// <summary>
/// Issues and validates short-lived (5 minute) 2FA challenge tokens.
/// A challenge token is issued by login handlers when the authenticated user has 2FA enabled.
/// The client must present it — along with the TOTP or recovery code — to
/// POST /auth/2fa/challenge to obtain the full JWT + refresh token.
///
/// Concrete implementation in Infrastructure signs the token using the LOCAL_AUTH secret
/// (same key used for dev JWT). In production this could use a dedicated GCP Secret Manager key.
/// </summary>
public interface IChallengeTokenService
{
    /// <summary>Issues a short-lived challenge token for the given user.</summary>
    string Issue(Guid userId);

    /// <summary>
    /// Validates the token and returns the user id, or null if the token is invalid/expired.
    /// </summary>
    Guid? Validate(string token);
}
