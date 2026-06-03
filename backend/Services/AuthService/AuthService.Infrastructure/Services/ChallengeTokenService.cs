using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Infrastructure.Auth;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Issues and validates short-lived (5 minute) HMAC-SHA256 signed challenge tokens.
/// Reuses the same dependency-free signing approach as <see cref="LocalJwt"/>
/// so no additional NuGet packages are required.
/// Token format: {base64url-header}.{base64url-payload}.{base64url-sig}
/// Payload fields: sub (userId), purpose ("2fa-challenge"), iat, exp.
/// </summary>
public sealed class ChallengeTokenService : IChallengeTokenService
{
    private const int ChallengeWindowMinutes = 5;
    private const string Purpose = "2fa-challenge";

    private readonly string _secret;

    public ChallengeTokenService(IConfiguration configuration)
    {
        _secret = configuration["LOCAL_AUTH:SECRET"]
            ?? Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET")
            ?? FirebaseAuthMiddleware.DefaultLocalSecret;
    }

    /// <inheritdoc />
    public string Issue(Guid userId)
    {
        var claims = new Dictionary<string, object?>
        {
            ["sub"]     = userId.ToString(),
            ["purpose"] = Purpose
        };
        return LocalJwt.Issue(claims, _secret, TimeSpan.FromMinutes(ChallengeWindowMinutes));
    }

    /// <inheritdoc />
    public Guid? Validate(string token)
    {
        var payload = LocalJwt.Validate(token, _secret);
        if (payload is null) return null;

        // Verify purpose claim
        if (!payload.Value.TryGetProperty("purpose", out var purposeProp)
            || purposeProp.GetString() != Purpose)
            return null;

        if (!payload.Value.TryGetProperty("sub", out var subProp))
            return null;

        var sub = subProp.GetString();
        return Guid.TryParse(sub, out var id) ? id : null;
    }
}
