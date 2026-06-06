using AuthService.Application.Common.Helpers;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FirebaseAdmin.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Auth;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Firebase Auth service using FirebaseAdmin SDK.
/// NOT Microsoft.Identity.Web.
///
/// Note: <see cref="CreateCustomTokenAsync"/> issues a SnapAccount <b>session JWT</b> (HS256) —
/// NOT a Firebase custom token. A custom token cannot be used as a bearer (the shared
/// FirebaseAuthMiddleware validates session JWTs / ID tokens, not custom tokens), so every login
/// flow returns a session JWT carrying the user's resolved RBAC claims.
/// </summary>
public sealed class FirebaseAuthService(
    ILogger<FirebaseAuthService> logger,
    IConfiguration configuration,
    IAuthDbContext db) : IFirebaseAuthService
{
    private const string SuperAdminRole = "SUPER_ADMIN";

    // Session-token lifetime. The opaque refresh token (30 days) is used to obtain a fresh one.
    private static readonly TimeSpan SessionTokenLifetime = TimeSpan.FromHours(12);

    private bool DevAuthEnabled =>
        string.Equals(configuration["LOCAL_AUTH"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("LOCAL_AUTH"), "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(configuration["DEV_AUTH_BYPASS"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true", StringComparison.OrdinalIgnoreCase);

    /// <summary>The session-JWT signing secret — shared with the validating middleware.</summary>
    private string SessionSecret => SessionTokenSecret.Resolve(configuration);

    public async Task<Result<string>> VerifyIdTokenAsync(string idToken, CancellationToken ct = default)
    {
        try
        {
            var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken, ct);
            return decodedToken.Uid;
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogWarning("Firebase token verification failed: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is invalid or expired.");
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException)
        {
            // Malformed token (invalid base64url JWT) throws before FirebaseAuthException — 401, not 500.
            logger.LogWarning("Malformed Firebase token: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is malformed.");
        }
    }

    /// <inheritdoc />
    public async Task<Result<FirebaseTokenClaims>> VerifyIdTokenAndGetClaimsAsync(
        string idToken,
        CancellationToken ct = default)
    {
        try
        {
            var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken, ct);

            var email = decodedToken.Claims.TryGetValue("email", out var emailObj)
                ? emailObj?.ToString()
                : null;

            var name = decodedToken.Claims.TryGetValue("name", out var nameObj)
                ? nameObj?.ToString()
                : null;

            return new FirebaseTokenClaims(decodedToken.Uid, email, name);
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogWarning("Firebase token verification failed during social sign-in: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is invalid or expired.");
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException)
        {
            // A structurally malformed token (e.g. not valid base64url JWT segments) throws from the
            // JWT decoder BEFORE FirebaseAuthException — treat it as unauthorized, never a 500.
            logger.LogWarning("Malformed Firebase token during social sign-in: {Message}", ex.Message);
            return Error.Unauthorized("Firebase.TokenInvalid", "The provided Firebase ID token is malformed.");
        }
    }

    /// <summary>
    /// Issues a SnapAccount <b>session JWT</b> (HS256) for the user identified by the
    /// <c>userId</c> claim. This is the bearer the shared middleware validates across all services
    /// — NOT a Firebase custom token (which cannot be used as a bearer). Carries
    /// userId / organizationId / roles / permissions so RBAC needs no per-request DB lookup.
    /// </summary>
    public async Task<Result<string>> CreateCustomTokenAsync(
        string uid,
        IDictionary<string, object>? claims = null,
        CancellationToken ct = default)
    {
        var userIdStr = claims is not null && claims.TryGetValue("userId", out var uidVal) ? uidVal?.ToString() : null;
        var phone     = claims is not null && claims.TryGetValue("phoneNumber", out var phoneVal) ? phoneVal?.ToString() : null;
        var email     = claims is not null && claims.TryGetValue("email", out var emailVal) ? emailVal?.ToString() : null;

        // ── Local dev: wildcard-permission token so the mobile customer can exercise every flow ──
        // (Firebase Admin is not configured locally; org may not exist yet at signup.)
        if (DevAuthEnabled)
        {
            // Resolve the user's active org membership the same way production does, so a
            // dev token issued/refreshed AFTER org creation carries the real organizationId.
            // Without this the org context stays empty and org-scoped calls (e.g. team
            // invite) fail OrgContextGuard even though perms are wildcard. Empty if the
            // user has no membership yet (fresh signup before the org exists).
            Guid? devOrgId = null;
            if (Guid.TryParse(userIdStr, out var devUserId))
            {
                devOrgId = await db.OrganizationMembers
                    .Where(m => m.UserId == devUserId && m.IsActive && m.DeletedAt == null)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => (Guid?)m.OrganizationId)
                    .FirstOrDefaultAsync(ct);
            }

            var jwtClaims = new Dictionary<string, object?>
            {
                ["userId"]         = userIdStr,
                ["organizationId"] = (devOrgId ?? Guid.Empty).ToString(),
                ["roles"]          = new[] { "BUSINESS_OWNER" },
                ["permissions"]    = new[] { "*" },
                ["phone_number"]   = phone,
                ["email"]          = email,
                ["firebase_uid"]   = uid,
            };
            logger.LogWarning(
                "LOCAL_AUTH/DEV_AUTH_BYPASS: issuing a wildcard local session token for uid {Uid} (NEVER in production).",
                uid);
            return LocalJwt.Issue(jwtClaims, SessionSecret, SessionTokenLifetime);
        }

        // ── Production: mint a session JWT carrying the user's resolved RBAC claims ──
        if (!Guid.TryParse(userIdStr, out var userId))
            return Error.Validation("Session.MissingUser", "Cannot issue a session token without a userId claim.");

        var sessionClaims = await BuildSessionClaimsAsync(userId, uid, email, phone, ct);
        return LocalJwt.Issue(sessionClaims, SessionSecret, SessionTokenLifetime);
    }

    /// <summary>
    /// Resolves the user's roles (platform + org), active organization, and effective permissions
    /// for embedding in a session JWT. SUPER_ADMIN gets the <c>*</c> wildcard.
    /// </summary>
    private async Task<Dictionary<string, object?>> BuildSessionClaimsAsync(
        Guid userId, string firebaseUid, string? emailHint, string? phoneHint, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);

        var platformRoles = await db.UserRoles
            .Where(ur => ur.UserId == userId && ur.IsActive && ur.DeletedAt == null)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name)
            .Distinct().ToListAsync(ct);

        var orgRoleNames = await db.OrganizationMembers
            .Where(m => m.UserId == userId && m.IsActive && m.DeletedAt == null)
            .Join(db.Roles, m => m.RoleId, r => r.Id, (_, r) => r.Name)
            .Distinct().ToListAsync(ct);

        var allRoles = platformRoles.Union(orgRoleNames, StringComparer.OrdinalIgnoreCase).ToList();

        var activeOrgId = await db.OrganizationMembers
            .Where(m => m.UserId == userId && m.IsActive && m.DeletedAt == null)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => (Guid?)m.OrganizationId)
            .FirstOrDefaultAsync(ct);

        IReadOnlyList<string> permissions = platformRoles.Contains(SuperAdminRole, StringComparer.OrdinalIgnoreCase)
            ? ["*"]
            : (await EffectivePermissionResolver.ResolveAsync(db, userId, activeOrgId, ct)).OrderBy(p => p).ToList();

        return new Dictionary<string, object?>
        {
            ["userId"]         = userId.ToString(),
            ["organizationId"] = activeOrgId?.ToString(),
            ["roles"]          = allRoles,
            ["permissions"]    = permissions,
            ["email"]          = emailHint ?? user?.Email,
            ["name"]           = user?.FullName,
            ["phone_number"]   = phoneHint ?? user?.PhoneNumber,
            ["firebase_uid"]   = firebaseUid,
        };
    }

    public async Task<Result> SetCustomClaimsAsync(
        string uid,
        IDictionary<string, object> claims,
        CancellationToken ct = default)
    {
        try
        {
            var readonlyClaims = claims.ToDictionary(k => k.Key, v => v.Value) as IReadOnlyDictionary<string, object>;
            await FirebaseAuth.DefaultInstance.SetCustomUserClaimsAsync(uid, readonlyClaims!, ct);
            return Result.Success();
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogError(ex, "Failed to set custom claims for uid {Uid}", uid);
            return Result.Failure(Error.Validation("Firebase.ClaimsFailed", "Failed to set user claims."));
        }
    }

    public async Task<Result> RevokeRefreshTokensAsync(string uid, CancellationToken ct = default)
    {
        try
        {
            await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid, ct);
            return Result.Success();
        }
        catch (FirebaseAuthException ex)
        {
            logger.LogError(ex, "Failed to revoke refresh tokens for uid {Uid}", uid);
            return Result.Failure(Error.Validation("Firebase.RevokeFailed", "Failed to revoke Firebase tokens."));
        }
    }
}
