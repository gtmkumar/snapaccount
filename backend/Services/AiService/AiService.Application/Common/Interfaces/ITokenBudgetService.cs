namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Atomic per-org per-day token budget enforcement service using the RESERVATION PATTERN.
///
/// RV-03 (SEC-AI-02): The previous implementation used <c>pg_advisory_xact_lock</c> to serialise
/// the budget read, but committed before the AI provider call — releasing the lock before the
/// audit row was written. Concurrent requests for the same org could both pass the budget check
/// while neither had a committed audit row, bypassing the daily cap.
///
/// The reservation pattern closes this TOCTOU race:
/// <list type="number">
///   <item>Call <see cref="TryAcquireBudgetSlotAsync"/>. If allowed, a <em>reservation row</em>
///         (<c>is_reservation = true</c>) is INSERT-ed inside the advisory-lock transaction and
///         committed before the lock is released. The daily-SUM query counts reservation rows, so
///         the next concurrent request for the same org sees this in-progress consumption.</item>
///   <item>Call the AI provider.</item>
///   <item>On success, call <see cref="FinaliseReservationAsync"/> to update the row with actual
///         token counts and set <c>is_reservation = false</c>.</item>
///   <item>On failure, call <see cref="AbortReservationAsync"/> to zero the token counts so the
///         failed call does not permanently consume budget.</item>
/// </list>
/// </summary>
public interface ITokenBudgetService
{
    /// <summary>
    /// Atomically checks the daily budget and — if available — inserts a reservation row
    /// inside the advisory-lock transaction, committing it before returning.
    ///
    /// Returns <c>(true, reservationId)</c> if the request may proceed.
    /// Returns <c>(false, null)</c> if the daily budget is exhausted.
    /// The <c>reservationId</c> must be passed to <see cref="FinaliseReservationAsync"/>
    /// or <see cref="AbortReservationAsync"/> after the provider call.
    /// </summary>
    /// <param name="orgId">Organisation. Null/Empty org (admin calls) always returns (true, null).</param>
    /// <param name="userId">Requesting user (Firebase UID) — recorded on the reservation row.</param>
    /// <param name="featureCode">Feature bucket (e.g. "chat_qa", "invoice_extract").</param>
    /// <param name="dailyBudget">Token cap per org per day.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<(bool Allowed, Guid? ReservationId)> TryAcquireBudgetSlotAsync(
        Guid? orgId,
        string userId,
        string featureCode,
        int dailyBudget,
        CancellationToken ct);

    /// <summary>
    /// Finalises the reservation row with actual provider results.
    /// Sets <c>is_reservation = false</c> and writes real token counts.
    /// Best-effort (never throws) — a logging failure must not fail the request.
    /// </summary>
    Task FinaliseReservationAsync(
        Guid reservationId,
        string provider,
        string model,
        int inputTokens,
        int outputTokens,
        int latencyMs,
        CancellationToken ct);

    /// <summary>
    /// Zeroes out a reservation row on provider failure so the failed call does not
    /// permanently consume budget. Sets <c>is_reservation = false</c>.
    /// Best-effort (never throws).
    /// </summary>
    Task AbortReservationAsync(Guid reservationId, string failureReason, CancellationToken ct);

    /// <summary>
    /// Records a non-reservation interaction row directly (e.g. budget-exceeded audit rows
    /// or admin cross-org calls where reservation is skipped).
    /// Best-effort (never throws).
    /// </summary>
    Task RecordNonReservationAsync(
        Guid? orgId,
        string userId,
        string featureCode,
        string provider,
        string model,
        int inputTokens,
        int outputTokens,
        int latencyMs,
        bool budgetExceeded,
        CancellationToken ct);

    /// <summary>
    /// Returns total tokens consumed today by <paramref name="orgId"/> for <paramref name="featureCode"/>
    /// (including in-flight reservation rows). Used for logging/metrics only.
    /// </summary>
    Task<int> GetDailyUsageAsync(Guid orgId, string featureCode, CancellationToken ct);
}
