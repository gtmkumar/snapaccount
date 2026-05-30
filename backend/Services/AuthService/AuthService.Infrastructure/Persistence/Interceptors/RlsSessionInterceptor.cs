using AuthService.Domain;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using Npgsql;
using SnapAccount.Shared.Application;
using System.Data;
using System.Data.Common;

namespace AuthService.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core interceptor that sets the PostgreSQL session variables required by
/// Row-Level Security policies on the <c>auth</c> schema per request:
///
///   <c>app.current_user_id</c>  — used by RLS policies on user-owned tables
///   <c>app.is_platform_admin</c> — set to 'true' for SUPER_ADMIN cross-org reads
///
/// This is defense-in-depth UNDER the authoritative application-layer delegation
/// checks, not a replacement for them. Without this, RLS policies silently match
/// nothing (since the session vars are never set) and provide zero tenant isolation.
///
/// SEC-RLS-001: Must run before any auth schema query in the request lifetime.
/// M1-R-001: Values are passed via NpgsqlParameter to SELECT set_config(...) — no string
/// interpolation of user-controlled values into SQL.
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
        var isPlatformAdmin = currentUser.HasPermission(AuthService.Domain.Permissions.PlatformOrgsRead)
                           || currentUser.HasPermission("*");
        var isPlatformAdminStr = isPlatformAdmin ? "true" : "false";

        try
        {
            if (connection.State != ConnectionState.Open)
                await connection.OpenAsync(ct);

            // M1-R-001: use SELECT set_config('key', @value, true) with NpgsqlParameter
            // to avoid any SQL injection via user-controlled claim values.
            // The third argument (true) scopes the value to the current transaction (same
            // behaviour as SET LOCAL — resets at transaction end).
            await using var cmd = connection.CreateCommand();
            cmd.CommandType = CommandType.Text;
            cmd.CommandText = """
                SELECT set_config('app.current_user_id',   @uid,            true),
                       set_config('app.is_platform_admin', @is_platform_admin, true)
                """;

            var uidParam = new NpgsqlParameter("@uid", NpgsqlTypes.NpgsqlDbType.Text)
            {
                Value = userId
            };
            var adminParam = new NpgsqlParameter("@is_platform_admin", NpgsqlTypes.NpgsqlDbType.Text)
            {
                Value = isPlatformAdminStr
            };
            cmd.Parameters.Add(uidParam);
            cmd.Parameters.Add(adminParam);

            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            // M1-R-003: log as Warning (not silently swallowed) so operations is alerted.
            // Do not rethrow — the application-layer isolation checks remain authoritative
            // and killing the request here would degrade availability without improving security.
            logger.LogWarning(ex,
                "RLS: Failed to set session variables for user {UserId}. " +
                "Application-layer checks still enforce isolation — investigate promptly.",
                userId);
        }
    }
}
