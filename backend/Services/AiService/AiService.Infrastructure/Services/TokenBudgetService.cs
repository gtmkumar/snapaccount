using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using AiService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AiService.Infrastructure.Services;

/// <summary>
/// PostgreSQL advisory-lock–based implementation of <see cref="ITokenBudgetService"/>.
///
/// RV-03 (SEC-AI-02): The previous implementation acquired <c>pg_advisory_xact_lock</c>, read
/// the daily SUM, then committed — releasing the lock BEFORE the AI provider call and audit write.
/// This left the original TOCTOU race intact: two concurrent requests for the same org could both
/// pass the budget check while neither had written its audit row yet.
///
/// The RESERVATION PATTERN closes the race:
/// <list type="bullet">
///   <item>Inside the advisory-lock transaction, after confirming budget is available, INSERT a
///         placeholder <c>ai.interactions</c> row with <c>is_reservation = true</c> and an estimated
///         token count. This row is committed WITH the lock still held by the same transaction.</item>
///   <item>The daily-SUM query counts reservation rows at their estimated value, so concurrent
///         requests for the same org see each other's in-progress consumption immediately.</item>
///   <item>After the provider call, the caller finalises the row (actual tokens) or zeroes it out
///         on failure via <see cref="FinaliseReservationAsync"/> / <see cref="AbortReservationAsync"/>,
///         so failed calls never permanently consume budget.</item>
/// </list>
///
/// Per-org lock granularity: lock key = <c>ABS(orgId.GetHashCode())</c>. Different orgs do not
/// block each other. Null orgId (admin/cross-org calls) skips the lock and always grants access.
/// </summary>
public sealed class TokenBudgetService(
    AiServiceDbContext db,
    ILogger<TokenBudgetService> logger) : ITokenBudgetService
{
    // Conservative token estimate for a reservation row (actual will replace this after the call).
    // Sized at the typical single-request cost so the sum guard rejects a concurrent request
    // that would exceed budget even if both used only this estimate.
    private const int ReservationEstimatedTokens = 1_000;

    /// <inheritdoc />
    public async Task<(bool Allowed, Guid? ReservationId)> TryAcquireBudgetSlotAsync(
        Guid? orgId,
        string userId,
        string featureCode,
        int dailyBudget,
        CancellationToken ct)
    {
        // Null org = admin cross-org call — no budget cap.
        if (orgId is null || orgId == Guid.Empty) return (true, null);

        // Advisory lock key: ABS of org hash → Postgres int8 key.
        var lockKey = (long)Math.Abs(orgId.GetHashCode());

        var today = DateTime.UtcNow.Date;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            // Acquire the per-org advisory lock WITHIN the transaction.
            // pg_advisory_xact_lock: transaction-scoped — released on commit/rollback.
            // lockKey is a safe computed long, not user-supplied data.
#pragma warning disable EF1002
            await db.Database.ExecuteSqlRawAsync(
                $"SELECT pg_advisory_xact_lock({lockKey})", ct);
#pragma warning restore EF1002

            // Daily sum INCLUDES reservation rows (is_reservation = true) so concurrent
            // requests see each other's in-progress consumption.
            var todayUsed = await db.AiInteractions
                .Where(i => i.OrganizationId == orgId
                            && i.CreatedAt >= today
                            && i.FeatureCode == featureCode
                            && !i.BudgetExceeded)
                .SumAsync(i => i.InputTokens + i.OutputTokens, ct);

            if (todayUsed + ReservationEstimatedTokens > dailyBudget)
            {
                logger.LogWarning(
                    "Org {OrgId} has exhausted daily token budget ({Used}/{Budget}) for {Feature}.",
                    orgId, todayUsed, dailyBudget, featureCode);
                await tx.RollbackAsync(ct);
                return (false, null);
            }

            // RV-03: INSERT reservation row INSIDE the locked transaction so the lock
            // is still held when the row is committed. Concurrent requests will see
            // this row in their SumAsync and correctly count this consumption.
            var reservation = AiInteraction.Reserve(orgId, userId, featureCode, ReservationEstimatedTokens);
            // Set CreatedAt here so the date-filter in SumAsync correctly includes this row.
            // The AuditableEntityInterceptor also sets it on SaveChanges, but the interceptor
            // may not run inside this explicit transaction context, so we set it defensively.
            reservation.CreatedAt = today;
            db.AiInteractions.Add(reservation);
            await db.SaveChangesAsync(ct);

            // Commit — releases the advisory lock. The reservation row is now durable and
            // visible to concurrent budget checks for the same org.
            await tx.CommitAsync(ct);

            logger.LogDebug(
                "Budget reservation {ReservationId} created for org {OrgId} feature {Feature}.",
                reservation.Id, orgId, featureCode);

            return (true, reservation.Id);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Budget check failed for org {OrgId}.", orgId);
            try { await tx.RollbackAsync(ct); } catch { /* best effort */ }
            // On DB error, fail open to avoid total service outage.
            // The AI provider's own rate-limiting provides a last-resort backstop.
            return (true, null);
        }
    }

    /// <inheritdoc />
    public async Task FinaliseReservationAsync(
        Guid reservationId,
        string provider,
        string model,
        int inputTokens,
        int outputTokens,
        int latencyMs,
        CancellationToken ct)
    {
        try
        {
            var row = await db.AiInteractions.FindAsync([reservationId], ct);
            if (row is null)
            {
                logger.LogWarning("FinaliseReservation: row {Id} not found.", reservationId);
                return;
            }

            row.Finalise(provider, model, inputTokens, outputTokens, latencyMs);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "FinaliseReservation failed for {Id} (non-fatal).", reservationId);
        }
    }

    /// <inheritdoc />
    public async Task AbortReservationAsync(Guid reservationId, string failureReason, CancellationToken ct)
    {
        try
        {
            var row = await db.AiInteractions.FindAsync([reservationId], ct);
            if (row is null)
            {
                logger.LogWarning("AbortReservation: row {Id} not found.", reservationId);
                return;
            }

            // Zero out tokens so the failed call does not permanently consume budget.
            row.MarkFailed(failureReason);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AbortReservation failed for {Id} (non-fatal).", reservationId);
        }
    }

    /// <inheritdoc />
    public async Task RecordNonReservationAsync(
        Guid? orgId,
        string userId,
        string featureCode,
        string provider,
        string model,
        int inputTokens,
        int outputTokens,
        int latencyMs,
        bool budgetExceeded,
        CancellationToken ct)
    {
        try
        {
            var interaction = AiInteraction.Record(
                orgId, userId, featureCode, provider, model,
                inputTokens, outputTokens, latencyMs, budgetExceeded);
            db.AiInteractions.Add(interaction);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "RecordNonReservation failed for org {OrgId} (non-fatal).", orgId);
        }
    }

    /// <inheritdoc />
    public async Task<int> GetDailyUsageAsync(Guid orgId, string featureCode, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        return await db.AiInteractions
            .Where(i => i.OrganizationId == orgId
                        && i.CreatedAt >= today
                        && i.FeatureCode == featureCode
                        && !i.BudgetExceeded)
            .SumAsync(i => i.InputTokens + i.OutputTokens, ct);
    }
}
