using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;

namespace AccountingService.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core <see cref="SaveChangesInterceptor"/> that sets Postgres session-level GUCs
/// required by the MCA statutory edit-log trigger (migration 071 / GAP-100).
///
/// The DB-level AFTER trigger on <c>accounting.journal_entry</c>,
/// <c>journal_entry_line</c>, <c>account</c>, and <c>ledger_entries</c> reads
/// <c>current_setting('app.current_user_id', TRUE)</c> to record who made the change.
/// Without setting this GUC before the INSERT/UPDATE/DELETE, <c>changed_by</c> would
/// always be NULL.
///
/// Implementation approach — <c>SET LOCAL</c> inside the implicit EF transaction:
///   EF Core wraps all SaveChanges writes in a transaction when there is none already.
///   We hook <see cref="SavingChangesAsync"/> (before the SQL) and issue a raw
///   <c>SET LOCAL app.current_user_id = '...'</c> on the same connection.
///   <c>SET LOCAL</c> scopes the GUC to the current transaction — it is automatically
///   rolled back if the transaction rolls back, and it does not pollute the connection
///   pool after the transaction completes.
///
/// This is the single, authoritative choke-point: no handler code needs to know about
/// GUCs. All write transactions originating from EF Core automatically carry the identity.
/// </summary>
public sealed class McaEditLogGucInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<McaEditLogGucInterceptor> _logger;

    /// <summary>Initialises the interceptor (scoped — one instance per request).</summary>
    public McaEditLogGucInterceptor(ICurrentUser currentUser, ILogger<McaEditLogGucInterceptor> logger)
    {
        _currentUser = currentUser;
        _logger = logger;
    }

    /// <inheritdoc />
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        SetGuc(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    /// <inheritdoc />
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        await SetGucAsync(eventData.Context, cancellationToken);
        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private void SetGuc(DbContext? context)
    {
        if (context is null) return;
        try
        {
            var userId = GetUserIdString();
            context.Database.ExecuteSqlRaw("SET LOCAL app.current_user_id = {0}", userId);
        }
        catch (Exception ex)
        {
            // Never let GUC failure block a write — log and continue.
            _logger.LogWarning(ex, "MCA edit-log GUC (app.current_user_id) could not be set; changed_by will be NULL.");
        }
    }

    private async Task SetGucAsync(DbContext? context, CancellationToken ct)
    {
        if (context is null) return;
        try
        {
            var userId = GetUserIdString();
            await context.Database.ExecuteSqlRawAsync(
                "SET LOCAL app.current_user_id = {0}", [userId], ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MCA edit-log GUC (app.current_user_id) could not be set; changed_by will be NULL.");
        }
    }

    /// <summary>
    /// Returns the current user id as a string, or an empty string when there is no
    /// authenticated user (e.g. background Hangfire jobs). The trigger treats an empty
    /// string as NULL for <c>changed_by</c>.
    /// </summary>
    private string GetUserIdString()
        => _currentUser.IsAuthenticated ? _currentUser.UserId.ToString() : string.Empty;
}
