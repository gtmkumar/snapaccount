using AuthService.Application.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Commands.RequestAccountDeletion;

/// <summary>
/// DPDP Act 2023 — Right to Erasure.
/// Marks the account for deletion (soft-delete + 30-day grace period before hard delete).
/// Revokes all local refresh tokens and Firebase refresh tokens immediately.
/// </summary>
public record RequestAccountDeletionCommand : ICommand;

/// <summary>
/// Handles account deletion.
/// Marks the user for erasure, revokes all local refresh tokens, and attempts to revoke
/// Firebase refresh tokens. Firebase revocation is non-fatal — if Firebase is temporarily
/// unavailable, the 1-hour Firebase ID token TTL is the acceptable exposure window.
/// </summary>
public sealed class RequestAccountDeletionCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    IFirebaseAuthService firebaseAuthService,
    ICurrentUser currentUser,
    ILogger<RequestAccountDeletionCommandHandler> logger)
    : ICommandHandler<RequestAccountDeletionCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        RequestAccountDeletionCommand request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", currentUser.UserId));

        var result = user.RequestAccountDeletion();
        if (result.IsFailure)
            return result;

        // Revoke all local refresh tokens immediately
        await refreshTokenRepository.RevokeAllForUserAsync(
            user.Id, "Account deletion requested", cancellationToken);

        // SEC-008: Revoke Firebase refresh tokens. Non-fatal — deletion must complete
        // regardless to honour DPDP Act 2023. 1-hour token TTL is the fallback window.
        if (!string.IsNullOrEmpty(user.FirebaseUid))
        {
            try
            {
                await firebaseAuthService.RevokeRefreshTokensAsync(
                    user.FirebaseUid, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "Failed to revoke Firebase refresh tokens for user {UserId}. " +
                    "Firebase tokens will expire naturally within 1 hour. Deletion continues.",
                    currentUser.UserId);
            }
        }

        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }
}
