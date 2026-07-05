namespace AuthService.Application.Interfaces;

/// <summary>
/// GAP-003 / NEW-002: Schedules a best-effort retry for Firebase refresh-token revocation.
/// Used by the account-deletion handler when the inline revoke fails so that the
/// DPDP erasure can complete immediately while the revoke is retried asynchronously.
///
/// Implementations are infrastructure-specific (Hangfire, Pub/Sub, etc.).
/// </summary>
public interface IFirebaseRevokeRetryScheduler
{
    /// <summary>
    /// Enqueues a durable retry job that will call
    /// <see cref="IFirebaseAuthService.RevokeRefreshTokensAsync"/> for the given uid.
    /// The job must be observable in an operations dashboard.
    /// </summary>
    /// <param name="firebaseUid">Firebase UID whose tokens must be revoked.</param>
    /// <param name="userId">Internal platform user ID — used for log context only.</param>
    void ScheduleRevoke(string firebaseUid, Guid userId);
}
