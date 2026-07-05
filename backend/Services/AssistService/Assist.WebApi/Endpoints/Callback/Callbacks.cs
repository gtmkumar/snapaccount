using CallbackService.Application.Callbacks.Commands.AddNote;
using CallbackService.Application.Callbacks.Commands.AssignCallback;
using CallbackService.Application.Callbacks.Commands.CancelCallback;
using CallbackService.Application.Callbacks.Commands.CompleteCallback;
using CallbackService.Application.Callbacks.Commands.ConfirmCallback;
using CallbackService.Application.Callbacks.Commands.EscalateCallback;
using CallbackService.Application.Callbacks.Commands.RequestCallback;
using CallbackService.Application.Callbacks.Commands.RescheduleCallback;
using CallbackService.Application.Callbacks.Queries.GetCallbackById;
using CallbackService.Application.Callbacks.Queries.ListCallbacks;
using CallbackService.Application.Dashboard.Queries.GetDashboardStats;
using CallbackService.Application.Dashboard.Queries.GetKpiSnapshot;
using CallbackService.Application.Dashboard.Queries.GetWorkloadByUser;
using CallbackService.Application.Internal.Commands.RefreshKpiMv;
using CallbackService.Domain.Enums;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;
using System.Security.Cryptography;

namespace CallbackService.Api.Endpoints;

/// <summary>
/// Callback request management endpoints.
/// State machine: Pending → Assigned → Confirmed → Completed | Escalated | Cancelled.
/// Rate limit: 100 req/min (standard).
/// </summary>
public sealed class Callbacks : EndpointGroupBase
{
    public override string? GroupName => "/callbacks";

    public override void Map(RouteGroupBuilder g)
    {
        // POST /callbacks — customer requests a callback
        g.MapPost("/", RequestCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RequestCallback")
            .WithSummary("Customer requests a new callback. Creates a Pending callback.");

        // GET /callbacks — list callbacks (paginated, filterable)
        g.MapGet("/", ListCallbacks)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListCallbacks")
            .WithSummary("Returns a paginated list of callbacks with optional filters.");

        // GET /callbacks/{id} — get full callback detail
        g.MapGet("/{id:guid}", GetCallbackById)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetCallbackById")
            .WithSummary("Returns full callback details including call notes.");

        // POST /callbacks/{id}/assign — agent picks up callback
        g.MapPost("/{id:guid}/assign", AssignCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("AssignCallback")
            .WithSummary("Assigns an agent to a Pending callback. Transitions to Assigned.");

        // POST /callbacks/{id}/confirm — agent confirms scheduled time
        g.MapPost("/{id:guid}/confirm", ConfirmCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ConfirmCallback")
            .WithSummary("Agent confirms a scheduled time. Transitions Assigned → Confirmed.");

        // POST /callbacks/{id}/complete — agent marks call as done
        g.MapPost("/{id:guid}/complete", CompleteCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CompleteCallback")
            .WithSummary("Agent marks the callback as completed.");

        // POST /callbacks/{id}/escalate — escalate to senior agent
        g.MapPost("/{id:guid}/escalate", EscalateCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("EscalateCallback")
            .WithSummary("Escalates the callback to a senior agent.");

        // POST /callbacks/{id}/cancel — cancel the callback
        g.MapPost("/{id:guid}/cancel", CancelCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CancelCallback")
            .WithSummary("Cancels the callback.");

        // POST /callbacks/{id}/reschedule — customer reschedules window
        g.MapPost("/{id:guid}/reschedule", RescheduleCallback)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RescheduleCallback")
            .WithSummary("Reschedules the callback to a new preferred window.");

        // POST /callbacks/{id}/notes — add a call note
        g.MapPost("/{id:guid}/notes", AddNote)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("AddCallNote")
            .WithSummary("Adds a call note to a callback.");

        // GET /callbacks/kpi — daily KPI snapshot (org-scoped, P6-HANDOFF-04)
        g.MapGet("/kpi", GetKpiSnapshot)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetCallbackKpi")
            .WithSummary("Returns daily KPI snapshot for the authenticated user's organisation.");

        // GET /callbacks/admin/dashboard-stats — admin-only count for cross-service dashboard
        g.MapGet("/admin/dashboard-stats", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : result.Error.ToHttpResult();
        })
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetCallbackAdminDashboardStats")
            .WithSummary("Open callback count for the admin cross-service dashboard.");

        // GET /callbacks/admin/workload-by-user — per-assignee callback counts
        g.MapGet("/admin/workload-by-user", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetWorkloadByUserQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetCallbackAdminWorkloadByUser")
            .WithSummary("Per-assignee callback workload — admin dashboard team-workload widget.");

        // POST /callbacks/internal/refresh-kpi-mv
        //
        // DG-INFRA-04: Triggered by Cloud Scheduler (callback-kpi-mv-refresh job,
        // defined in infra/pubsub-scheduler-recurring-jobs.sh lines ~389-395) or
        // indirectly by CallbackRecurringJobsSubscriber on CALLBACK_KPI_MV_REFRESH.
        //
        // Security: X-Internal-Token header matched against InternalApi:SharedToken
        // (constant-time HMAC comparison — RV-01 / SEC-AI-02 pattern). No Firebase JWT
        // is required — Cloud Scheduler cannot hold one. Do NOT add .RequireAuthorization()
        // as that would reject unauthenticated Cloud Scheduler calls.
        //
        // Expected latency: ~200–500 ms (REFRESH MATERIALIZED VIEW CONCURRENTLY on
        // callback.kpi_daily_snapshot). CONCURRENTLY is safe because migration 067/073
        // asserts the required uq_kpi_daily_snapshot_org_date unique index.
        g.MapPost("/internal/refresh-kpi-mv", RefreshKpiMv)
            .WithName("RefreshCallbackKpiMv")
            .WithSummary(
                "[DG-INFRA-04] REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot. " +
                "Secured by X-Internal-Token header (Cloud Scheduler caller).");
    }

    private static async Task<IResult> RequestCallback(
        RequestCallbackRequest req,
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var command = new RequestCallbackCommand(
            currentUser.UserId,
            currentUser.OrganizationId,
            req.PhoneNumber,
            req.Category,
            req.Priority,
            req.IssueDescription,
            req.PreferredWindowStart,
            req.PreferredWindowEnd);

        var result = await sender.Send(command, ct);
        return result.IsSuccess
            ? Results.Created($"/callbacks/{result.Value.CallbackId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> ListCallbacks(
        ICurrentUser currentUser,
        ISender sender,
        Guid? userId = null,
        Guid? agentId = null,
        // Comma-separated list — the admin "All Open" filter sends PENDING,SCHEDULED,IN_PROGRESS.
        string? status = null,
        CallbackCategory? category = null,
        int page = 1,
        int pageSize = 20,
        // 'size' is the param name the admin client sends; accept it as an alias for pageSize.
        int? size = null,
        CancellationToken ct = default)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();

        // Parse the comma-separated status filter; ignore unrecognised tokens rather than 500.
        List<CallbackStatus>? statuses = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            statuses = status
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => Enum.TryParse<CallbackStatus>(s, ignoreCase: true, out var parsed) ? parsed : (CallbackStatus?)null)
                .Where(s => s.HasValue)
                .Select(s => s!.Value)
                .ToList();
            if (statuses.Count == 0) statuses = null;
        }

        // P6-HANDOFF-04: KPI MV has no RLS — filter by org from claims
        var query = new ListCallbacksQuery(
            UserId: userId,
            OrganizationId: currentUser.OrganizationId,
            AgentId: agentId,
            Statuses: statuses,
            Category: category,
            Page: page,
            PageSize: size ?? pageSize);

        var result = await sender.Send(query, ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetCallbackById(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetCallbackByIdQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(new { error = result.Error.Message });
    }

    private static async Task<IResult> AssignCallback(
        Guid id, AssignCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new AssignCallbackCommand(id, req.AgentId), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> ConfirmCallback(
        Guid id, ConfirmCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ConfirmCallbackCommand(id, req.ScheduledAt), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> CompleteCallback(
        Guid id, CompleteCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CompleteCallbackCommand(id, req.ResolutionSummary), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> EscalateCallback(
        Guid id, EscalateCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new EscalateCallbackCommand(id, req.Reason), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> CancelCallback(
        Guid id, CancelCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CancelCallbackCommand(id, req.Reason), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> RescheduleCallback(
        Guid id, RescheduleCallbackRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RescheduleCallbackCommand(id, req.NewWindowStart, req.NewWindowEnd), ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> AddNote(
        Guid id, AddNoteRequest req, ICurrentUser currentUser, ISender sender, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var result = await sender.Send(new AddNoteCommand(id, currentUser.UserId, req.Content, req.IsInternal), ct);
        return result.IsSuccess ? Results.Created() : Results.BadRequest(new { error = result.Error.Message });
    }

    /// <summary>
    /// DG-INFRA-04: POST /callbacks/internal/refresh-kpi-mv
    /// Refreshes callback.kpi_daily_snapshot materialized view via MediatR.
    /// Secured by X-Internal-Token (constant-time HMAC, RV-01/SEC-AI-02 pattern).
    /// Cloud Scheduler calls this directly; also triggered by CallbackRecurringJobsSubscriber.
    /// </summary>
    private static async Task<IResult> RefreshKpiMv(
        ISender sender,
        IConfiguration config,
        HttpContext ctx,
        CancellationToken ct)
    {
        // Validate X-Internal-Token before doing any work.
        var configuredToken = config["InternalApi:SharedToken"];
        var headerToken = ctx.Request.Headers["X-Internal-Token"].FirstOrDefault();

        // Dev-bypass: if InternalApi:SharedToken is not configured, allow the call but log a warning.
        // This mirrors the dev-mode patterns elsewhere in the composite host.
        var isDev = string.Equals(
            config["ASPNETCORE_ENVIRONMENT"] ?? "Development", "Development",
            StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(configuredToken))
        {
            if (string.IsNullOrWhiteSpace(headerToken)
                || !CryptographicEqual(configuredToken, headerToken))
            {
                return Results.Unauthorized();
            }
        }
        else if (!isDev)
        {
            // Non-dev, token not configured — treat as misconfiguration → reject.
            return Results.Problem(
                "InternalApi:SharedToken is not configured. " +
                "Configure it before enabling Cloud Scheduler jobs in production.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var result = await sender.Send(new RefreshKpiMvCommand(), ct);
        return result.IsSuccess
            ? Results.Ok(new { message = "callback.kpi_daily_snapshot refreshed successfully.", refreshedAt = DateTime.UtcNow })
            : result.Error.ToHttpResult();
    }

    /// <summary>
    /// RV-01 (SEC-AI-02): Constant-time token comparison using HMAC-SHA256.
    /// Prevents timing-attack leakage of token length that occurs with
    /// <c>CryptographicOperations.FixedTimeEquals</c> on unequal-length inputs.
    /// Both values are hashed under the same domain key, producing equal-length
    /// digests that are then compared with <c>FixedTimeEquals</c>.
    /// </summary>
    private static bool CryptographicEqual(string a, string b)
    {
        ReadOnlySpan<byte> domainKey = "snapaccount.internal-token.v1"u8;
        Span<byte> hashA = stackalloc byte[32];
        Span<byte> hashB = stackalloc byte[32];
        HMACSHA256.TryHashData(domainKey, System.Text.Encoding.UTF8.GetBytes(a), hashA, out _);
        HMACSHA256.TryHashData(domainKey, System.Text.Encoding.UTF8.GetBytes(b), hashB, out _);
        return CryptographicOperations.FixedTimeEquals(hashA, hashB);
    }

    // GET /callbacks/kpi [Authorize] — GAP-012: real query over callback.kpi_daily_snapshot MV
    // WEB-FIX (a): accepts "range" string param (7d/30d/90d) as well as legacy daysBack int.
    //              When "range" is provided it takes precedence over daysBack.
    private static async Task<IResult> GetKpiSnapshot(
        ICurrentUser currentUser,
        ISender sender,
        string? range = null,
        int daysBack = 30,
        CancellationToken ct = default)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();

        // P6-HANDOFF-04: OrganizationId ALWAYS comes from the caller's JWT claims —
        // never from a query parameter — so cross-org reads (IDOR) are impossible.
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue || orgId == Guid.Empty)
            return Results.Problem(
                "Organisation context missing from session. " +
                "Complete business onboarding and call POST /auth/token/refresh-context first.",
                statusCode: 422);

        // WEB-FIX: parse the range string to days; falls back to daysBack int for backward compat.
        var resolvedDays = range?.ToLowerInvariant() switch
        {
            "7d"  => 7,
            "30d" => 30,
            "90d" => 90,
            "fy"  => 365,
            "24h" => 1,
            _     => daysBack,
        };
        var clampedDays = Math.Clamp(resolvedDays, 1, 365);
        var result = await sender.Send(new GetKpiSnapshotQuery(orgId.Value, clampedDays), ct);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }
}

// ─────────────────── Request DTOs ───────────────────

/// <summary>Request body for POST /callbacks.</summary>
public record RequestCallbackRequest(
    string PhoneNumber,
    CallbackCategory Category,
    CallbackPriority Priority,
    string? IssueDescription,
    DateTime? PreferredWindowStart,
    DateTime? PreferredWindowEnd);

/// <summary>Request body for POST /callbacks/{id}/assign.</summary>
public record AssignCallbackRequest(Guid AgentId);

/// <summary>Request body for POST /callbacks/{id}/confirm.</summary>
public record ConfirmCallbackRequest(DateTime ScheduledAt);

/// <summary>Request body for POST /callbacks/{id}/complete.</summary>
public record CompleteCallbackRequest(string? ResolutionSummary);

/// <summary>Request body for POST /callbacks/{id}/escalate.</summary>
public record EscalateCallbackRequest(string Reason);

/// <summary>Request body for POST /callbacks/{id}/cancel.</summary>
public record CancelCallbackRequest(string? Reason);

/// <summary>Request body for POST /callbacks/{id}/reschedule.</summary>
public record RescheduleCallbackRequest(DateTime NewWindowStart, DateTime NewWindowEnd);

/// <summary>Request body for POST /callbacks/{id}/notes.</summary>
public record AddNoteRequest(string Content, bool IsInternal = false);
