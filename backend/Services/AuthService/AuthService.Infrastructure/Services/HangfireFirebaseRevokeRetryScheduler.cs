using AuthService.Application.Interfaces;
using Hangfire;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// GAP-003 / NEW-002: Hangfire-backed implementation of <see cref="IFirebaseRevokeRetryScheduler"/>.
///
/// Schedules a durable background job that will call
/// <see cref="IFirebaseAuthService.RevokeRefreshTokensAsync"/> with automatic exponential
/// back-off retries (default Hangfire 10 attempts over ~24 h).  The job is visible in the
/// Hangfire dashboard at /hangfire, satisfying the "retry observable in logs" acceptance criterion.
/// </summary>
public sealed class HangfireFirebaseRevokeRetryScheduler(
    IBackgroundJobClient backgroundJobClient,
    ILogger<HangfireFirebaseRevokeRetryScheduler> logger)
    : IFirebaseRevokeRetryScheduler
{
    /// <inheritdoc />
    public void ScheduleRevoke(string firebaseUid, Guid userId)
    {
        var jobId = backgroundJobClient.Enqueue<FirebaseTokenRevokeJob>(
            job => job.ExecuteAsync(firebaseUid, userId, CancellationToken.None));

        logger.LogInformation(
            "Hangfire revoke job {JobId} enqueued for Firebase uid {FirebaseUid} (user {UserId}).",
            jobId, firebaseUid, userId);
    }
}

/// <summary>
/// Hangfire job that retries revoking Firebase refresh tokens.
/// Lives in Infrastructure so the Hangfire dependency stays out of the Application layer.
/// </summary>
public sealed class FirebaseTokenRevokeJob(
    IFirebaseAuthService firebaseAuthService,
    ILogger<FirebaseTokenRevokeJob> logger)
{
    /// <summary>
    /// Executes the Firebase token revoke.  Throws on failure so Hangfire retries the job.
    /// </summary>
    public async Task ExecuteAsync(string firebaseUid, Guid userId, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "FirebaseTokenRevokeJob: attempting revoke for uid {FirebaseUid} (user {UserId}).",
            firebaseUid, userId);

        var result = await firebaseAuthService.RevokeRefreshTokensAsync(firebaseUid, cancellationToken);

        if (result.IsSuccess)
        {
            logger.LogInformation(
                "FirebaseTokenRevokeJob: revoke succeeded for uid {FirebaseUid} (user {UserId}).",
                firebaseUid, userId);
            return;
        }

        // Throw so Hangfire retries with exponential back-off.
        var message =
            $"FirebaseTokenRevokeJob: revoke failed for uid {firebaseUid} (user {userId}): {result.Error.Message}";
        logger.LogError(
            "FirebaseTokenRevokeJob: revoke failed for uid {FirebaseUid} (user {UserId}): {Error}. Will retry.",
            firebaseUid, userId, result.Error.Message);

        throw new InvalidOperationException(message);
    }
}
