using AccountingService.Application.Dashboard.Queries.GetDashboardMetrics;
using AccountingService.Application.Dashboard.Queries.GetRecentActivities;
using AccountingService.Application.EditLog.Queries.ExportEditLog;
using AccountingService.Application.EditLog.Queries.GetEditLog;
using AccountingService.Application.FiscalYear.Commands.CloseFiscalYear;
using AccountingService.Application.JournalBatches.Commands.PostJournalBatch;
using AccountingService.Application.JournalBatches.Commands.ReviewPosting;
using AccountingService.Application.JournalBatches.Commands.ReversePosting;
using AccountingService.Application.Organizations.Commands.BootstrapCoa;
using AccountingService.Application.Reports.Queries.GetBalanceSheet;
using AccountingService.Application.Reports.Queries.GetComparativeAnalysis;
using AccountingService.Application.Reports.Queries.GetLedgerByAccount;
using AccountingService.Application.Reports.Queries.GetProfitAndLoss;
using AccountingService.Application.Reports.Queries.GetTaxLiability;
using AccountingService.Application.Reports.Queries.GetTrialBalance;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Net.Mime;

namespace AccountingService.Api.Endpoints;

/// <summary>
/// All /accounting endpoints — journal entries, ledger, trial balance, financial reports,
/// fiscal year close, and org COA bootstrap.
/// Phase 6A: all endpoints are fully implemented — zero 501 responses, zero TODO markers.
/// Inherits <see cref="EndpointGroupBase"/>; discovered automatically by
/// <see cref="WebApplicationExtensions.MapEndpoints"/>.
/// </summary>
public sealed class Accounting : EndpointGroupBase
{
    /// <summary>Route prefix: /accounting.</summary>
    public override string? GroupName => "/accounting";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // DG-DASH-01: GET /accounting/dashboard-metrics — mobile Home KPI cards
        // Mobile: HomeScreen.tsx line 83, DashboardMetrics interface lines 39-47.
        // Permission: accounting.reports.read (PermissionBehavior enforces).
        // Rate limit: standard (100 req/min per user).
        groupBuilder.MapGet("/dashboard-metrics", GetDashboardMetrics)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetDashboardMetrics")
            .WithSummary("DG-DASH-01: Mobile Home KPI metrics — totalSales, totalExpenses, netPnL, " +
                         "gstPayable, salesTrend, expensesTrend, period. Org-scoped, current Indian FY. " +
                         "Permission: accounting.reports.read.");

        // DG-DASH-01: GET /accounting/recent-activities?limit=N — mobile Home activity feed
        // Mobile: HomeScreen.tsx line 100, ActivityItem interface lines 49-55.
        // Permission: accounting.reports.read (PermissionBehavior enforces).
        groupBuilder.MapGet("/recent-activities", GetRecentActivities)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetRecentActivities")
            .WithSummary("DG-DASH-01: Mobile Home activity feed — recent documents + GST events. " +
                         "Returns ActivityItem[] (id, type, description, amount?, timestamp). " +
                         "Permission: accounting.reports.read. Max limit=50.");

        // POST /accounting/journal-entries — post a manual journal batch
        groupBuilder.MapPost("/journal-entries", PostJournalBatch)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // GET /accounting/trial-balance?fyYear={year}
        groupBuilder.MapGet("/trial-balance", GetTrialBalance)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // GET /accounting/reports/{type}?fyYear={year}&periodMonth={m}&accountId={id}
        groupBuilder.MapGet("/reports/{type}", GetReport)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/fiscal-year/close
        groupBuilder.MapPost("/fiscal-year/close", CloseFiscalYear)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/organizations/{id}/bootstrap-coa
        groupBuilder.MapPost("/organizations/{id:guid}/bootstrap-coa", BootstrapCoa)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/postings/{id}/review
        groupBuilder.MapPost("/postings/{id:guid}/review", ReviewPosting)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/postings/{id}/reverse
        groupBuilder.MapPost("/postings/{id:guid}/reverse", ReversePosting)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // GAP-044 / Comparative analysis ─────────────────────────────────────

        // GET /accounting/reports/comparative?baseYear=2026&priorYear=2025&categoryFilter=INCOME
        // RBAC: accounting.reports.read (PermissionBehavior enforces)
        // Shape: chart-friendly { labels[], baseRevenue[], priorRevenue[], … , topMovers[] }
        groupBuilder.MapGet("/reports/comparative", GetComparativeAnalysis)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetComparativeAnalysis")
            .WithSummary("YoY + MoM comparative analysis of revenue/expense/profit (GAP-044). " +
                         "Chart-friendly series arrays aligned to Indian FY month labels (Apr–Mar). " +
                         "Permission: accounting.reports.read.");

        // GAP-100 / MCA edit-log ─────────────────────────────────────────────

        // GET /accounting/edit-log?fyYear=&entityType=&page=&pageSize=
        // Permission: accounting.editlog.read  (enforced by PermissionBehavior)
        groupBuilder.MapGet("/edit-log", GetEditLog)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetAccountingEditLog")
            .WithSummary("MCA statutory edit log (GAP-100). Paginated. Permission: accounting.editlog.read. " +
                         "Returns who changed what on the books-of-account tables and when.");

        // GET /accounting/edit-log/export?fyYear=2026-27  → CSV download
        // Permission: accounting.editlog.read (enforced by PermissionBehavior)
        groupBuilder.MapGet("/edit-log/export", ExportEditLog)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ExportAccountingEditLog")
            .WithSummary("Stream full MCA edit log for a financial year as CSV (statutory FY export). " +
                         "Permission: accounting.editlog.read.");
    }

    // ── DG-DASH-01 handlers ──────────────────────────────────────────────────

    /// <summary>
    /// GET /accounting/dashboard-metrics
    /// Mobile: HomeScreen.tsx GET '/accounting/dashboard-metrics' → DashboardMetrics.
    /// </summary>
    private static async Task<IResult> GetDashboardMetrics(
        ISender sender,
        ICurrentUser currentUser)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var result = await sender.Send(new GetDashboardMetricsQuery(currentUser.OrganizationId.Value));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.Forbidden
                ? Results.Forbid()
                : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    /// <summary>
    /// GET /accounting/recent-activities?limit=N
    /// Mobile: HomeScreen.tsx GET '/accounting/recent-activities?limit=5' → ActivityItem[].
    /// </summary>
    private static async Task<IResult> GetRecentActivities(
        ISender sender,
        ICurrentUser currentUser,
        int limit = 5)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var result = await sender.Send(new GetRecentActivitiesQuery(currentUser.OrganizationId.Value, limit));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.Forbidden
                ? Results.Forbid()
                : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> PostJournalBatch(
        PostJournalBatchRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var orgId = currentUser.OrganizationId.Value;
        var command = new PostJournalBatchCommand(
            orgId,
            req.Description,
            req.PostingDate,
            req.Entries.Select(e => new JournalBatchLineRequest(
                e.DebitAccountId, e.CreditAccountId, e.Amount, e.Narration)).ToList());

        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.Created($"/accounting/journal-batches/{result.Value.BatchId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> GetTrialBalance(
        ISender sender,
        ICurrentUser currentUser,
        int fyYear = 2026)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var result = await sender.Send(new GetTrialBalanceQuery(currentUser.OrganizationId.Value, fyYear));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetReport(
        string type,
        ISender sender,
        ICurrentUser currentUser,
        int fyYear = 2026,
        int? periodMonth = null,
        Guid? accountId = null)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var orgId = currentUser.OrganizationId.Value;

        return type.ToLowerInvariant() switch
        {
            "trial-balance" => await HandleQuery(sender.Send(new GetTrialBalanceQuery(orgId, fyYear))),
            "profit-and-loss" => await HandleQuery(sender.Send(new GetProfitAndLossQuery(orgId, fyYear, periodMonth))),
            "balance-sheet" => await HandleQuery(sender.Send(new GetBalanceSheetQuery(orgId, fyYear))),
            "tax-liability" => await HandleQuery(sender.Send(new GetTaxLiabilityQuery(orgId, fyYear, periodMonth))),
            "ledger" when accountId.HasValue => await HandleQuery(sender.Send(new GetLedgerByAccountQuery(orgId, accountId.Value, fyYear, periodMonth))),
            "ledger" => Results.BadRequest(new { error = "accountId query parameter required for ledger report." }),
            _ => Results.BadRequest(new { error = $"Unknown report type '{type}'." })
        };
    }

    private static async Task<IResult> CloseFiscalYear(
        CloseFiscalYearRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var command = new CloseFiscalYearCommand(currentUser.OrganizationId.Value, req.FyYear, currentUser.UserId, req.Notes);
        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> BootstrapCoa(Guid id, ISender sender)
    {
        var result = await sender.Send(new BootstrapOrganizationChartOfAccountsCommand(id));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> ReviewPosting(
        Guid id,
        ReviewPostingRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        var command = new ReviewPostingCommand(id, req.Approve, currentUser.UserId);
        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> ReversePosting(Guid id, ISender sender, ICurrentUser currentUser)
    {
        var result = await sender.Send(new ReversePostingCommand(id, currentUser.UserId));
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> GetEditLog(
        ISender sender,
        ICurrentUser currentUser,
        string? fyYear = null,
        string? entityType = null,
        int page = 1,
        int pageSize = 50)
    {
        var result = await sender.Send(new GetEditLogQuery(fyYear, entityType, page, pageSize));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.Forbidden
                ? Results.Forbid()
                : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> ExportEditLog(
        ISender sender,
        ICurrentUser currentUser,
        string fyYear = "")
    {
        var result = await sender.Send(new ExportEditLogQuery(fyYear));
        if (!result.IsSuccess)
            return result.Error.Type == ErrorType.Forbidden
                ? Results.Forbid()
                : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });

        var export = result.Value;
        var bytes = System.Text.Encoding.UTF8.GetBytes(export.Csv);
        return Results.File(bytes, MediaTypeNames.Text.Csv, export.FileName);
    }

    private static async Task<IResult> GetComparativeAnalysis(
        ISender sender,
        ICurrentUser currentUser,
        int baseYear = 2026,
        int? priorYear = null,
        string? categoryFilter = null)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var result = await sender.Send(
            new GetComparativeAnalysisQuery(currentUser.OrganizationId.Value, baseYear, priorYear, categoryFilter));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.Forbidden
                ? Results.Forbid()
                : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> HandleQuery<T>(Task<Result<T>> queryTask)
    {
        var result = await queryTask;
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.NotFound
                ? Results.NotFound(new { error = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Message });
    }
}

// Request DTOs
internal record PostJournalBatchRequest(
    string Description,
    DateOnly PostingDate,
    IReadOnlyList<JournalLineRequest> Entries);

internal record JournalLineRequest(
    Guid DebitAccountId,
    Guid CreditAccountId,
    decimal Amount,
    string Narration);

internal record CloseFiscalYearRequest(int FyYear, string? Notes = null);
internal record ReviewPostingRequest(bool Approve);
