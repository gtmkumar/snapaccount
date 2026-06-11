using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;

namespace AuthService.Application.Auth.Commands.AdminRefresh;

/// <summary>
/// GAP-051: Admin browser refresh flow.
///
/// Reads a rotation refresh token from an httpOnly+Secure+SameSite=Strict cookie
/// (cookie name: <c>sa_admin_rt</c>). Validates and rotates it, then returns a
/// new short-lived access token in the response body.
///
/// CSRF protection: SameSite=Strict + custom header <c>X-Requested-With: XMLHttpRequest</c>
/// (double-submit not needed because SameSite=Strict alone prevents cross-site cookie delivery
/// on modern browsers; the custom-header check adds defence-in-depth for older browsers
/// and reverse proxies that strip SameSite). The custom header requirement is documented
/// and enforced in the endpoint handler — callers without it receive 400.
///
/// Mobile flow: 100% untouched. This command only handles admin browser sessions.
/// The <see cref="AuthService.Application.RefreshTokens.Commands.RefreshToken.RefreshTokenCommand"/>
/// remains the mobile token refresh path.
/// </summary>
public record AdminRefreshCommand(string CookieRefreshToken) : ICommand<AdminRefreshResponse>;

/// <summary>
/// Response to the admin refresh.
/// The endpoint writes <see cref="NewCookieRefreshToken"/> to the httpOnly cookie
/// and returns only <see cref="AccessToken"/> + <see cref="ExpiresAt"/> in the JSON body.
/// </summary>
/// <param name="AccessToken">Short-lived HS256 session JWT (1 hour expiry for admin sessions).</param>
/// <param name="ExpiresAt">UTC expiry of the new access token.</param>
/// <param name="NewCookieRefreshToken">Plaintext new refresh token — endpoint sets this in httpOnly cookie, never returned in body.</param>
public record AdminRefreshResponse(string AccessToken, DateTime ExpiresAt, string NewCookieRefreshToken);

/// <summary>Validates AdminRefreshCommand.</summary>
public sealed class AdminRefreshCommandValidator : AbstractValidator<AdminRefreshCommand>
{
    public AdminRefreshCommandValidator()
    {
        RuleFor(x => x.CookieRefreshToken)
            .NotEmpty().WithMessage("Refresh cookie is required.")
            .MaximumLength(512);
    }
}

/// <summary>
/// Validates and rotates the admin httpOnly refresh token, issuing a new access token.
/// Reuses the existing <see cref="IRefreshTokenRepository"/> and <see cref="IFirebaseAuthService"/>
/// path — no forked logic, consistent with the mobile rotation flow.
/// </summary>
public sealed class AdminRefreshCommandHandler(
    IRefreshTokenRepository refreshTokenRepository,
    IUserRepository userRepository,
    IFirebaseAuthService firebaseAuthService)
    : ICommandHandler<AdminRefreshCommand, AdminRefreshResponse>
{
    /// <inheritdoc />
    public async Task<Result<AdminRefreshResponse>> Handle(
        AdminRefreshCommand request,
        CancellationToken cancellationToken)
    {
        // Hash the incoming token (stored as SHA-256 hash in DB)
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(request.CookieRefreshToken)));

        var refreshToken = await refreshTokenRepository.GetByTokenHashAsync(tokenHash, cancellationToken);
        if (refreshToken is null || !refreshToken.IsValid)
            return Error.Unauthorized("AdminRefresh.InvalidToken", "Refresh token is invalid, expired, or already used.");

        // Revoke old token (rotation)
        refreshToken.Revoke("Admin browser token rotated");
        await refreshTokenRepository.UpdateAsync(refreshToken, cancellationToken);

        var user = await userRepository.GetByIdAsync(refreshToken.UserId, cancellationToken);
        if (user is null || !user.IsActive)
            return Error.Unauthorized("AdminRefresh.UserInvalid", "User not found or account is deactivated.");

        // Mint a new session access token using the same IFirebaseAuthService path as mobile
        var claims = new Dictionary<string, object> { ["userId"] = user.Id.ToString() };
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            user.FirebaseUid ?? user.Id.ToString(),
            claims,
            cancellationToken);

        if (tokenResult.IsFailure)
            return Result<AdminRefreshResponse>.Failure(tokenResult.Error);

        // Rotate: issue a new opaque refresh token and persist
        var newTokenBytes = RandomNumberGenerator.GetBytes(64);
        var newTokenPlain = Convert.ToBase64String(newTokenBytes);
        var newTokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(newTokenPlain)));

        var newRefreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = newTokenHash,
            DeviceId = refreshToken.DeviceId, // keep same device binding
            ExpiresAt = DateTime.UtcNow.AddDays(7) // admin sessions expire in 7 days
        };
        await refreshTokenRepository.AddAsync(newRefreshToken, cancellationToken);

        var expiresAt = DateTime.UtcNow.AddHours(1); // admin access token = 1 hour (shorter than mobile 12h)

        // The endpoint will:
        //  1. Set NewCookieRefreshToken as httpOnly+Secure+SameSite=Strict cookie.
        //  2. Return only AccessToken + ExpiresAt in the JSON body (never NewCookieRefreshToken).
        return new AdminRefreshResponse(
            AccessToken: tokenResult.Value,
            ExpiresAt: expiresAt,
            NewCookieRefreshToken: newTokenPlain);
    }
}
