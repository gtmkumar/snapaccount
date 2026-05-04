using CallbackService.Application.Callbacks.Commands.AddNote;
using CallbackService.Application.Dashboard.Queries.GetDashboardStats;
using CallbackService.Application.Dashboard.Queries.GetWorkloadByUser;
using CallbackService.Application.Callbacks.Commands.AssignCallback;
using CallbackService.Application.Callbacks.Commands.CancelCallback;
using CallbackService.Application.Callbacks.Commands.CompleteCallback;
using CallbackService.Application.Callbacks.Commands.ConfirmCallback;
using CallbackService.Application.Callbacks.Commands.EscalateCallback;
using CallbackService.Application.Callbacks.Commands.RequestCallback;
using CallbackService.Application.Callbacks.Commands.RescheduleCallback;
using CallbackService.Application.Callbacks.Queries.GetCallbackById;
using CallbackService.Application.Callbacks.Queries.ListCallbacks;
using CallbackService.Domain.Enums;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

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
                : Results.Problem(result.Error.Message);
        })
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetCallbackAdminDashboardStats")
            .WithSummary("Open callback count for the admin cross-service dashboard.");

        // GET /callbacks/admin/workload-by-user — per-assignee callback counts
        g.MapGet("/admin/workload-by-user", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetWorkloadByUserQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetCallbackAdminWorkloadByUser")
            .WithSummary("Per-assignee callback workload — admin dashboard team-workload widget.");
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
        CallbackStatus? status = null,
        CallbackCategory? category = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken ct = default)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();

        // P6-HANDOFF-04: KPI MV has no RLS — filter by org from claims
        var query = new ListCallbacksQuery(
            UserId: userId,
            OrganizationId: currentUser.OrganizationId,
            AgentId: agentId,
            Status: status,
            Category: category,
            Page: page,
            PageSize: pageSize);

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

    private static IResult GetKpiSnapshot(ICurrentUser currentUser)
    {
        // P6-HANDOFF-04: callback.kpi_daily_snapshot is a MV with no RLS.
        // Full KPI query implementation requires direct SQL against the MV.
        // Returning a placeholder — full implementation requires db-engineer MV confirmation.
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        return Results.Ok(new
        {
            message = "KPI snapshot endpoint live. MV query pending db-engineer confirmation of kpi_daily_snapshot schema.",
            organizationId = currentUser.OrganizationId
        });
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
