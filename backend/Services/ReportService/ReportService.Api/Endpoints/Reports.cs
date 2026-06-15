using MediatR;
using ReportService.Application.Reports.Commands.CreateShareLink;
using ReportService.Application.Reports.Commands.GenerateReport;
using ReportService.Application.Reports.Queries.GetDownloadUrl;
using ReportService.Application.Reports.Queries.GetReport;
using ReportService.Application.Reports.Queries.ListReports;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Api;

namespace ReportService.Api.Endpoints;

/// <summary>
/// All /reports endpoints — generate, list, get, download.
/// Phase 6C: all endpoints fully wired, ZERO 501.
///
/// Rate limit: standard (100 req/min).
/// PDF generation expected latency: up to 30 seconds.
/// </summary>
public sealed class Reports : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/reports";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        /// <summary>POST /reports/generate — Generate a report (PDF or JSON).</summary>
        groupBuilder.MapPost("/generate", GenerateReport)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GenerateReport")
            .WithSummary("Generate a PDF or JSON report")
            .WithDescription(
                "Supported types: TrialBalance, ProfitAndLoss, BalanceSheet, CashFlow, " +
                "TaxLiability, LedgerByAccount, LoanPackage. " +
                "Expected latency: up to 30s for PDF. LoanPackage requires loanApplicationId.");

        /// <summary>GET /reports — List report jobs for current org (paginated).</summary>
        groupBuilder.MapGet("/", ListReports)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListReports")
            .WithSummary("List report jobs for current organisation");

        /// <summary>GET /reports/{id} — Get a single report job by ID.</summary>
        groupBuilder.MapGet("/{id:guid}", GetReport)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetReport")
            .WithSummary("Get report job by ID (IDOR-scoped to org)");

        /// <summary>GET /reports/{id}/download-url — Get signed GCS download URL.</summary>
        groupBuilder.MapGet("/{id:guid}/download-url", GetDownloadUrl)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetReportDownloadUrl")
            .WithSummary("Get signed GCS download URL for a completed report");

        /// <summary>
        /// POST /reports/{id}/share-link — Generate a 15-min share URL for CA / bank.
        /// SEC-046: TTL capped at 15 minutes. Returns a fresh signed URL on each call.
        /// </summary>
        groupBuilder.MapPost("/{id:guid}/share-link", CreateShareLink)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CreateReportShareLink")
            .WithSummary("Generate a 15-minute signed share link for sharing a report with CA or bank.")
            .WithDescription(
                "SEC-046: TTL is capped at 15 minutes. " +
                "Caller must own the report (IDOR-scoped to org). " +
                "Use case: share-with-CA, share-with-bank flows.");

        // ── GAP-032: Tally XML export ─────────────────────────────────────────

        /// <summary>POST /reports/tally-export — Generate Tally-importable XML (or CSV fallback).</summary>
        groupBuilder.MapPost("/tally-export", GenerateTallyExport)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GenerateTallyExport")
            .WithSummary("GAP-032: Generate Tally XML export (or CSV fallback when feature flag is off).")
            .WithDescription(
                "Produces Tally-importable XML (ENVELOPE/TALLYMESSAGE/LEDGER + VOUCHER). " +
                "Feature flag: Report:TallyExportEnabled=true in config/Secret Manager. " +
                "When flag is false, returns CSV fallback. " +
                "Uses GenerateReport flow with ReportType=TallyExport.");

        // ── GAP-043: Chat thread PDF export ───────────────────────────────────

        /// <summary>POST /reports/chat-thread-pdf — Export a chat thread as PDF.</summary>
        groupBuilder.MapPost("/chat-thread-pdf", GenerateChatThreadPdf)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GenerateChatThreadPdf")
            .WithSummary("GAP-043: Export a chat thread as a formatted PDF.")
            .WithDescription(
                "Reads messages from chat.messages (cross-schema, same DB). " +
                "IDOR: thread must belong to the calling user's organisation. " +
                "Renders with QuestPDF (fonts CI-verified). " +
                "Returns job ID; use GET /reports/{id}/download-url for the file.");
    }

    // ── Handler delegates ──────────────────────────────────────────────────────

    private static async Task<IResult> GenerateReport(
        GenerateReportRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new GenerateReportCommand(
                req.ReportType,
                req.Format,
                req.FinancialYear,
                req.PeriodStart,
                req.PeriodEnd,
                req.LoanApplicationId),
            ct);

        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> ListReports(
        [AsParameters] ListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListReportsQuery(p.ReportType, p.Status, p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> GetReport(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetReportQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    private static async Task<IResult> GetDownloadUrl(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetDownloadUrlQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    private static async Task<IResult> CreateShareLink(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateShareLinkCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GenerateTallyExport(
        TallyExportRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new GenerateReportCommand(
                ReportType.TallyExport,
                ReportFormat.Pdf, // format field ignored by TallyExportGenerator; XML or CSV is auto-selected
                null,
                req.PeriodStart,
                req.PeriodEnd),
            ct);

        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GenerateChatThreadPdf(
        ChatThreadPdfRequest req, ISender sender, CancellationToken ct)
    {
        // Encode ThreadId as FinancialYear string (reuses existing job schema without DDL change)
        var result = await sender.Send(
            new GenerateReportCommand(
                ReportType.ChatThreadPdf,
                ReportFormat.Pdf,
                req.ThreadId.ToString(), // encoded as FinancialYear
                null,
                null),
            ct);

        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static int MapError(SnapAccount.Shared.Domain.Error error)
        => error.Type switch
        {
            SnapAccount.Shared.Domain.ErrorType.NotFound => 404,
            SnapAccount.Shared.Domain.ErrorType.Validation => 422,
            SnapAccount.Shared.Domain.ErrorType.Conflict => 409,
            SnapAccount.Shared.Domain.ErrorType.Forbidden => 403,
            SnapAccount.Shared.Domain.ErrorType.Unauthorized => 401,
            _ => 500
        };
}

// ── Request/param types ──────────────────────────────────────────────────────

/// <summary>Request body for generating a report.</summary>
internal record GenerateReportRequest(
    ReportType ReportType,
    ReportFormat Format = ReportFormat.Pdf,
    string? FinancialYear = null,
    DateTime? PeriodStart = null,
    DateTime? PeriodEnd = null,
    Guid? LoanApplicationId = null);

/// <summary>Query parameters for listing reports.</summary>
internal record ListParams(
    string? ReportType = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20);

/// <summary>GAP-032: Request body for Tally XML export.</summary>
internal record TallyExportRequest(
    DateTime? PeriodStart = null,
    DateTime? PeriodEnd = null);

/// <summary>GAP-043: Request body for chat thread PDF export.</summary>
internal record ChatThreadPdfRequest(Guid ThreadId);
