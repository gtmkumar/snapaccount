using System.Security.Cryptography;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.RefreshTokens.Commands.RefreshToken;

/// <summary>Exchanges a valid refresh token for a new Firebase access token and rotated refresh token.</summary>
public record RefreshTokenCommand(string RefreshToken) : ICommand<RefreshTokenResponse>;

/// <summary>Response containing the new access token and rotated refresh token.</summary>
public record RefreshTokenResponse(string AccessToken, string NewRefreshToken, DateTime ExpiresAt);

/// <summary>FluentValidation validator for <see cref="RefreshTokenCommand"/>.</summary>
public sealed class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty().WithMessage("Refresh token is required.");
    }
}

/// <summary>
/// Validates and rotates a refresh token, issuing a new Firebase custom token
/// and a new refresh token. The old token is revoked on successful rotation.
/// </summary>
public sealed class RefreshTokenCommandHandler(
    IRefreshTokenRepository refreshTokenRepository,
    IUserRepository userRepository,
    IFirebaseAuthService firebaseAuthService)
    : ICommandHandler<RefreshTokenCommand, RefreshTokenResponse>
{
    /// <inheritdoc />
    public async Task<Result<RefreshTokenResponse>> Handle(
        RefreshTokenCommand request,
        CancellationToken cancellationToken)
    {
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(request.RefreshToken)));

        var refreshToken = await refreshTokenRepository.GetByTokenHashAsync(tokenHash, cancellationToken);
        if (refreshToken is null || !refreshToken.IsValid)
            return Error.Validation("RefreshToken.Invalid", "Refresh token is invalid or expired.");

        // Rotate — revoke old, issue new
        refreshToken.Revoke("Token rotated");
        await refreshTokenRepository.UpdateAsync(refreshToken, cancellationToken);

        var user = await userRepository.GetByIdAsync(refreshToken.UserId, cancellationToken);
        if (user is null || !user.IsActive)
            return Error.NotFound("User", refreshToken.UserId);

        var customTokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            user.FirebaseUid ?? user.Id.ToString(),
            ct: cancellationToken);

        if (customTokenResult.IsFailure)
            return customTokenResult.Error;

        // Generate new opaque refresh token (stored as SHA-256 hash)
        var newTokenBytes = RandomNumberGenerator.GetBytes(64);
        var newTokenPlain = Convert.ToBase64String(newTokenBytes);
        var newTokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(newTokenPlain)));

        var newRefreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = newTokenHash,
            DeviceId = refreshToken.DeviceId,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(newRefreshToken, cancellationToken);

        return new RefreshTokenResponse(
            customTokenResult.Value,
            newTokenPlain,
            newRefreshToken.ExpiresAt);
    }
}
