using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;

namespace AuthService.Infrastructure.Auth;

/// <summary>
/// Middleware that performs device integrity attestation (Play Integrity / App Attest).
/// GAP-064: 2026 fintech baseline — prevents bots/emulators from driving OTP and loan flows.
///
/// Placement: registered in AuthService after <c>FirebaseAuthMiddleware</c> so the current
/// user context is available for telemetry (may be null on anonymous OTP-send calls).
///
/// Behaviour matrix:
/// <list type="table">
///   <listheader><term>Condition</term><description>Action</description></listheader>
///   <item><term>Header absent + RequireToken=false (default)</term><description>SKIPPED — allow, log warning.</description></item>
///   <item><term>Header absent + RequireToken=true + Enforce=true</term><description>403 DeviceIntegrity.TokenRequired.</description></item>
///   <item><term>Token present, verdict PASS</term><description>Allow.</description></item>
///   <item><term>Token present, verdict FAIL + Enforce=false (default)</term><description>Allow, log warning (soft-fail).</description></item>
///   <item><term>Token present, verdict FAIL + Enforce=true</term><description>403 DeviceIntegrity.Failed.</description></item>
///   <item><term>Token present, verdict NOT_CONFIGURED</term><description>Treated as SKIPPED — allow.</description></item>
/// </list>
///
/// All outcomes are recorded to <c>auth.device_integrity_checks</c> (telemetry only — never blocks
/// when Enforce=false; never throws).
///
/// Configuration keys (all optional — safe defaults for local dev):
/// <list type="bullet">
///   <item><c>DeviceIntegrity:Enforce</c> — bool, default false. Set true to block FAIL verdicts.</item>
///   <item><c>DeviceIntegrity:RequireToken</c> — bool, default false. Set true to block absent headers in enforce mode.</item>
///   <item><c>DeviceIntegrity:CheckedEndpoints</c> — comma-separated path prefixes to check, default "/auth/otp/send,/auth/otp/verify,/auth/password/login,/auth/social/firebase".</item>
/// </list>
/// </summary>
public sealed class DeviceIntegrityMiddleware(
    RequestDelegate next,
    IConfiguration configuration,
    ILogger<DeviceIntegrityMiddleware> logger)
{
    private const string IntegrityTokenHeader = "X-Device-Integrity";
    private const string PlatformHeader = "X-Device-Integrity-Platform";

    // Default endpoints that require integrity checks — OTP flows + login
    private static readonly string[] DefaultCheckedPaths =
    [
        "/auth/otp/send",
        "/auth/otp/verify",
        "/auth/password/login",
        "/auth/social/firebase",
    ];

    private readonly bool _enforce =
        configuration.GetValue<bool>("DeviceIntegrity:Enforce");

    private readonly bool _requireToken =
        configuration.GetValue<bool>("DeviceIntegrity:RequireToken");

    private readonly string[] _checkedPaths = ParsePaths(
        configuration["DeviceIntegrity:CheckedEndpoints"]);

    /// <inheritdoc />
    public async Task InvokeAsync(HttpContext httpContext)
    {
        // Only check configured paths; skip all others immediately
        var path = httpContext.Request.Path.Value ?? string.Empty;
        var shouldCheck = _checkedPaths.Any(p =>
            path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

        if (!shouldCheck)
        {
            await next(httpContext);
            return;
        }

        var token = httpContext.Request.Headers[IntegrityTokenHeader].FirstOrDefault();
        var platform = httpContext.Request.Headers[PlatformHeader].FirstOrDefault();
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString();

        // Read user context (may be null for anonymous OTP-send)
        var currentUser = httpContext.RequestServices.GetService<ICurrentUser>();
        Guid? userId = null;
        Guid? orgId = null;
        try
        {
            if (currentUser is not null && currentUser.IsAuthenticated)
            {
                userId = currentUser.UserId;
                orgId = currentUser.OrganizationId;
            }
        }
        catch
        {
            // Silently ignore — user context is best-effort in middleware
        }

        DeviceIntegrityResult result;

        if (string.IsNullOrWhiteSpace(token))
        {
            // No token provided
            if (_enforce && _requireToken)
            {
                await RecordAndReturn403Async(
                    httpContext, path, platform, userId, orgId, clientIp,
                    "SKIPPED", "Token absent in enforce+requireToken mode.");
                return;
            }

            result = new DeviceIntegrityResult(DeviceIntegrityVerdict.Skipped, "Header absent");
            logger.LogDebug(
                "[DeviceIntegrity] No token on {Path} — Enforce={Enforce} RequireToken={RequireToken}. SKIPPED.",
                path, _enforce, _requireToken);
        }
        else
        {
            // Verify the token
            var verifier = httpContext.RequestServices.GetRequiredService<IDeviceIntegrityVerifier>();
            try
            {
                result = await verifier.VerifyAsync(
                    token,
                    platform ?? "UNKNOWN",
                    httpContext.RequestAborted);
            }
            catch (Exception ex)
            {
                // Verifier must never throw to the caller — log and treat as NotConfigured
                logger.LogError(ex,
                    "[DeviceIntegrity] Verifier threw exception on {Path}. Treating as NotConfigured (soft-fail).",
                    path);
                result = new DeviceIntegrityResult(
                    DeviceIntegrityVerdict.NotConfigured,
                    $"Verifier exception: {ex.GetType().Name}");
            }

            if (result.Verdict == DeviceIntegrityVerdict.Fail && _enforce)
            {
                await RecordAndReturn403Async(
                    httpContext, path, platform, userId, orgId, clientIp,
                    "FAIL", result.Reason);
                return;
            }
        }

        // Record telemetry asynchronously — never block the request
        _ = Task.Run(async () =>
        {
            await RecordTelemetryAsync(
                httpContext.RequestServices,
                path, platform,
                result.Verdict.ToString().ToUpperInvariant(),
                userId, orgId, clientIp,
                result.Reason);
        });

        await next(httpContext);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    private async Task RecordAndReturn403Async(
        HttpContext ctx,
        string path,
        string? platform,
        Guid? userId,
        Guid? orgId,
        string? clientIp,
        string verdict,
        string? reason)
    {
        logger.LogWarning(
            "[DeviceIntegrity] BLOCKED {Path} — Platform={Platform} Verdict={Verdict} Reason={Reason}.",
            path, platform, verdict, reason);

        _ = Task.Run(async () =>
        {
            await RecordTelemetryAsync(
                ctx.RequestServices,
                path, platform, verdict,
                userId, orgId, clientIp, reason);
        });

        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "DeviceIntegrity.Failed",
                title = "Device integrity check failed.",
                status = 403,
                detail = "The device could not be verified as a genuine, unmodified device. " +
                         "Please ensure you are using the official SnapAccount app.",
            }));
    }

    private static async Task RecordTelemetryAsync(
        IServiceProvider services,
        string path,
        string? platform,
        string verdict,
        Guid? userId,
        Guid? orgId,
        string? clientIp,
        string? reason)
    {
        // Use a new scope — the middleware scope is over once the response starts
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IAuthDbContext>();
            var check = DeviceIntegrityCheck.Record(
                verdict: verdict,
                endpoint: path,
                platform: platform,
                userId: userId,
                organizationId: orgId,
                failureReason: reason,
                clientIp: clientIp);
            db.DeviceIntegrityChecks.Add(check);
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            // Telemetry write failures MUST NOT propagate — log only
            var loggerFactory = services.GetService<ILoggerFactory>();
            loggerFactory?
                .CreateLogger<DeviceIntegrityMiddleware>()
                .LogError(ex, "[DeviceIntegrity] Failed to write telemetry to device_integrity_checks.");
        }
    }

    private static string[] ParsePaths(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured))
            return DefaultCheckedPaths;
        return configured
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }
}
