using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;

namespace AuthService.Application.Auth.Commands.AdminLogin;

/// <summary>
/// GAP-051: Admin logout — revokes the httpOnly refresh cookie and blacklists the token.
/// Called by POST /auth/admin/logout.
/// Clears the <c>sa_admin_rt</c> cookie on the response regardless of whether the
/// token is found in the database (idempotent logout).
/// </summary>
public record AdminLogoutCommand(string? CookieRefreshToken) : ICommand;

/// <summary>Handles admin logout by revoking the refresh token and instructing the endpoint to clear the cookie.</summary>
public sealed class AdminLogoutCommandHandler(
    IRefreshTokenRepository refreshTokenRepository)
    : ICommandHandler<AdminLogoutCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(AdminLogoutCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CookieRefreshToken))
            return Result.Success(); // No cookie → nothing to revoke; cookie cleared by endpoint

        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(request.CookieRefreshToken)));

        var refreshToken = await refreshTokenRepository.GetByTokenHashAsync(tokenHash, cancellationToken);
        if (refreshToken is not null && refreshToken.IsValid)
        {
            refreshToken.Revoke("Admin browser logout");
            await refreshTokenRepository.UpdateAsync(refreshToken, cancellationToken);
        }

        return Result.Success();
    }
}
