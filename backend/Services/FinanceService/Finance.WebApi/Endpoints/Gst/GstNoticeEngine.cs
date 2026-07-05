using GstService.Application.NoticeDeadlineRules.Queries.ListDeadlineRules;
using GstService.Application.Notices.Commands.SetNoticeFormType;
using GstService.Application.Notices.Commands.UpdateAppealStage;
using GstService.Application.Notices.Queries.GetNoticeDeadline;
using GstService.Application.Notices.Queries.SimulateDrc;
using GstService.Domain.Enums;
using MediatR;
using SnapAccount.Shared.Api;

namespace GstService.Api.Endpoints;

/// <summary>
/// GST Notice Engine endpoints — form-type taxonomy, statutory deadline computation,
/// DRC-01B/01C pre-filing simulator, and GSTAT appeal tracking.
/// GAP-108: migration 084.
///
/// Rate limit: "standard" (100 req/min) for read endpoints;
///             "gst-write-strict" (30 req/min) for write endpoints.
///
/// AI latency: SimulateDrc runs entirely against existing DB data — no AI calls.
///             Expected latency: &lt;200ms for typical SME data volumes.
/// </summary>
public sealed class GstNoticeEngine : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/gst";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Form-type + deadline management ────────────────────────────────────

        // PATCH /gst/notices/{id}/form-type
        // Sets (or corrects) the form-type taxonomy + stamps statutory deadline.
        groupBuilder.MapPatch("/notices/{id:guid}/form-type", SetNoticeFormType)
            .RequireAuthorization()
            .RequireRateLimiting("gst-write-strict")
            .WithName("SetGstNoticeFormType")
            .WithSummary(
                "Sets the CGST form-type taxonomy (ASMT_10/DRC_01/01A/01B/01C/ADT_01/OTHER) " +
                "on a notice and stamps the statutory response deadline from config-driven rules.");

        // GET /gst/notices/{id}/deadline
        // Returns computed deadline + days-remaining + GSTAT backlog flag.
        groupBuilder.MapGet("/notices/{id:guid}/deadline", GetNoticeDeadline)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetGstNoticeDeadline")
            .WithSummary(
                "Returns statutory deadline, effective deadline (overridden or statutory), " +
                "days remaining, overdue flag, and GSTAT backlog flag for a notice. " +
                "Expected latency: <100ms. No rate-limit token cost.");

        // ── GSTAT appeal stage tracking ─────────────────────────────────────

        // PATCH /gst/notices/{id}/appeal-stage
        // Updates the GSTAT appeal stage (forward-only state machine).
        groupBuilder.MapPatch("/notices/{id:guid}/appeal-stage", UpdateAppealStage)
            .RequireAuthorization()
            .RequireRateLimiting("gst-write-strict")
            .WithName("UpdateGstNoticeAppealStage")
            .WithSummary(
                "Updates the GSTAT appeal stage (forward-only: NONE→REPLY_FILED→ORDER_RECEIVED→" +
                "APPEAL_FILED→GSTAT_PENDING→RESOLVED). Sets appeal deadline (90 days from order " +
                "date) and evaluates the 2026-06-30 GSTAT backlog flag.");

        // ── DRC pre-filing simulator ─────────────────────────────────────────

        // GET /gst/notices/simulate-drc?orgId=&formType=DRC_01B&fy=2025-26&month=4
        // Runs EXISTING reconciliation engine data; returns would-trigger verdict + mismatch lines.
        // Rate: standard (no AI, no external API).
        groupBuilder.MapGet("/notices/simulate-drc", SimulateDrc)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SimulateGstDrc")
            .WithSummary(
                "Pre-filing DRC-01B/01C simulator. " +
                "DRC-01B: compares FILED GSTR-1 liability vs GSTR-3B paid tax for the period. " +
                "DRC-01C: reads existing ITC reconciliation (gst.itc_mismatches) for EXCESS_CLAIM " +
                "and AMOUNT_MISMATCH rows. Returns wouldTrigger verdict + mismatch lines. " +
                "dataAvailable=false when source data is absent — never fakes a verdict. " +
                "Expected latency: <200ms. Rate: standard (100 req/min).");

        // ── Deadline rules (admin / read) ─────────────────────────────────────

        // GET /gst/notice-deadline-rules?fy=2025-26
        // Returns all active statutory deadline rules (config-driven, FY-versioned).
        groupBuilder.MapGet("/notice-deadline-rules", ListDeadlineRules)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListGstNoticeDeadlineRules")
            .WithSummary(
                "Returns all active GST notice statutory deadline rules. " +
                "Filter by fy= to see rules for a specific financial year. " +
                "Rules are config-driven (gst.notice_deadline_rules) — never hardcoded.");
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> SetNoticeFormType(
        Guid id,
        SetNoticeFormTypeRequest req,
        ISender sender,
        CancellationToken ct)
    {
        var result = await sender.Send(
            new SetNoticeFormTypeCommand(id, req.FormType, req.ExplicitDeadlineOverride), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetNoticeDeadline(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetNoticeDeadlineQuery(id), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }

    private static async Task<IResult> UpdateAppealStage(
        Guid id,
        UpdateAppealStageRequest req,
        ISender sender,
        CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateAppealStageCommand(id, req.NewStage, req.OrderDate, req.AppealWindowDaysOverride), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }

    private static async Task<IResult> SimulateDrc(
        ISender sender,
        CancellationToken ct,
        Guid? orgId = null,
        string? formType = null,
        string? fy = null,
        int? month = null)
    {
        if (!orgId.HasValue)
            return Results.BadRequest(new { error = "orgId query parameter is required.", code = "GST.MissingOrganizationId" });

        if (string.IsNullOrWhiteSpace(formType) || !Enum.TryParse<GstNoticeFormType>(formType, out var parsedFormType))
            return Results.BadRequest(new
            {
                error = "formType must be one of: DRC_01B, DRC_01C.",
                code = "GST.InvalidFormType"
            });

        if (string.IsNullOrWhiteSpace(fy))
            return Results.BadRequest(new { error = "fy (financial year, e.g. 2025-26) is required.", code = "GST.MissingFy" });

        if (!month.HasValue || month.Value < 1 || month.Value > 12)
            return Results.BadRequest(new { error = "month (1-12) is required.", code = "GST.InvalidMonth" });

        var result = await sender.Send(
            new SimulateDrcQuery(orgId.Value, parsedFormType, fy, month.Value), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }

    private static async Task<IResult> ListDeadlineRules(
        ISender sender,
        CancellationToken ct,
        string? fy = null)
    {
        var result = await sender.Send(new ListDeadlineRulesQuery(fy), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

internal record SetNoticeFormTypeRequest(
    GstNoticeFormType FormType,
    DateOnly? ExplicitDeadlineOverride = null);

internal record UpdateAppealStageRequest(
    GstNoticeAppealStage NewStage,
    DateOnly? OrderDate = null,
    int? AppealWindowDaysOverride = null);
