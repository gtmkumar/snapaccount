using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using Npgsql;
using SnapAccount.Shared.Application;
using System.Data;
using System.Data.Common;

namespace SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core <see cref="DbConnectionInterceptor"/> that sets the PostgreSQL session variables
/// required by Row-Level Security policies across ALL user-owned schemas:
///
///   <c>app.current_user_id</c>      — used by RLS policies on user-owned tables
///   <c>app.is_platform_admin</c>    — set to 'true' for SUPER_ADMIN cross-org reads
///
/// SEC-RLS-001: Must run before any query in the request lifetime.
///
/// This shared version is promoted from
/// <c>AuthService.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor</c>
/// so that Finance (Document, Loan, Gst, Itr, Report) and Assist (Chat, AI, Callback)
/// DbContexts also enforce RLS, closing DG-SEC-01.
///
/// Registration pattern (in every module's DI):
/// <code>
///   services.AddScoped&lt;RlsSessionInterceptor&gt;();
///   services.AddDbContext&lt;MyDbContext&gt;((sp, options) => {
///       options.AddInterceptors(sp.GetRequiredService&lt;RlsSessionInterceptor&gt;());
///       ...
///   });
/// </code>
///
/// M1-R-001: Values are passed via NpgsqlParameter — no string interpolation of
/// user-controlled values into SQL.
/// </summary>
public sealed class RlsSessionInterceptor(
    ICurrentUser currentUser,
    ILogger<RlsSessionInterceptor> logger)
    : DbConnectionInterceptor
{
    /// <inheritdoc />
    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await SetRlsSessionVarsAsync(connection, cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    /// <inheritdoc />
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        SetRlsSessionVarsAsync(connection, CancellationToken.None).GetAwaiter().GetResult();
        base.ConnectionOpened(connection, eventData);
    }

    private async Task SetRlsSessionVarsAsync(DbConnection connection, CancellationToken ct)
    {
        // Only set when the user is authenticated (skips anonymous health-check requests)
        if (!currentUser.IsAuthenticated || currentUser.UserId == Guid.Empty)
            return;

        var userId = currentUser.UserId.ToString();
        // Platform admin can read across orgs (e.g. SUPER_ADMIN with '*' permission).
        var isPlatformAdmin = currentUser.HasPermission("platform.orgs.read")
                           || currentUser.HasPermission("*");
        var isPlatformAdminStr = isPlatformAdmin ? "true" : "false";

        try
        {
            if (connection.State != ConnectionState.Open)
                await connection.OpenAsync(ct);

            // M1-R-001: use SELECT set_config('key', @value, true) with NpgsqlParameter
            // to avoid any SQL injection via user-controlled claim values.
            // The third argument (true) scopes the value to the current transaction
            // (same behaviour as SET LOCAL — resets at transaction end).
            await using var cmd = connection.CreateCommand();
            cmd.CommandType = CommandType.Text;
            cmd.CommandText = """
                SELECT set_config('app.current_user_id',   @uid,              true),
                       set_config('app.is_platform_admin', @is_platform_admin, true)
                """;

            cmd.Parameters.Add(new NpgsqlParameter("@uid", NpgsqlTypes.NpgsqlDbType.Text) { Value = userId });
            cmd.Parameters.Add(new NpgsqlParameter("@is_platform_admin", NpgsqlTypes.NpgsqlDbType.Text) { Value = isPlatformAdminStr });

            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            // M1-R-003: log at ERROR level so an on-call alert fires.
            // ALERT: If this fires in production, RLS session variables were NOT set for
            // the current request — defence-in-depth is degraded. Investigate immediately.
            // We intentionally do NOT rethrow: authoritative application-layer org-ownership
            // checks remain in place, and failing the entire request would degrade availability
            // without materially improving security.
            logger.LogError(ex,
                "RLS: Failed to set session variables for user {UserId} (DG-SEC-01). " +
                "Row-Level Security defence-in-depth is degraded for this request — " +
                "application-layer checks still enforce isolation but INVESTIGATE PROMPTLY.",
                userId);
        }
    }
}
