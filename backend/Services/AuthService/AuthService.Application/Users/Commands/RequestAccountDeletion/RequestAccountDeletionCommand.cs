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
/// Firebase refresh tokens. Firebase revocation is best-effort (GAP-003 / NEW-002):
/// if Firebase is temporarily unreachable, local erasure still completes and a Hangfire
/// retry job is enqueued to revoke the tokens asynchronously. The 1-hour Firebase ID
/// token TTL is the acceptable exposure window while the retry runs.
/// </summary>
public sealed class RequestAccountDeletionCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    IFirebaseAuthService firebaseAuthService,
    ICurrentUser currentUser,
    IFirebaseRevokeRetryScheduler revokeRetryScheduler,
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

        // SEC-008 / GAP-003: Revoke Firebase refresh tokens — BEST EFFORT.
        // Deletion must complete regardless to honour DPDP Act 2023 Right-to-Erasure.
        // If the revoke fails (Result.Failure or exception), a Hangfire retry job is
        // enqueued with exponential back-off so the revoke eventually succeeds.
        if (!string.IsNullOrEmpty(user.FirebaseUid))
        {
            await RevokeFirebaseTokensBestEffortAsync(user.FirebaseUid, user.Id, cancellationToken);
        }

        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }

    /// <summary>
    /// Attempts to revoke Firebase refresh tokens; on any failure logs at Error level,
    /// enqueues a Hangfire retry (observable in the Hangfire dashboard), and continues.
    /// The retry uses the <see cref="FirebaseTokenRevokeJob"/> so the job class and uid
    /// are both recorded in the Hangfire storage for auditability.
    /// </summary>
    private async Task RevokeFirebaseTokensBestEffortAsync(
        string firebaseUid, Guid userId, CancellationToken cancellationToken)
    {
        bool revokeSucceeded = false;
        try
        {
            var revokeResult = await firebaseAuthService.RevokeRefreshTokensAsync(
                firebaseUid, cancellationToken);

            if (revokeResult.IsSuccess)
            {
                revokeSucceeded = true;
                logger.LogInformation(
                    "Firebase refresh tokens revoked for user {UserId}.", userId);
            }
            else
            {
                logger.LogError(
                    "Firebase revoke returned failure for user {UserId}: {Error}. " +
                    "Enqueueing Hangfire retry — tokens expire naturally within 1 hour.",
                    userId, revokeResult.Error.Message);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Firebase revoke threw for user {UserId}. " +
                "Enqueueing Hangfire retry — tokens expire naturally within 1 hour.",
                userId);
        }

        if (!revokeSucceeded)
        {
            // Enqueue a persistent, retryable job (observable in dashboard).
            revokeRetryScheduler.ScheduleRevoke(firebaseUid, userId);

            logger.LogWarning(
                "Firebase token revoke retry enqueued for uid {FirebaseUid} (user {UserId}).",
                firebaseUid, userId);
        }
    }
}
