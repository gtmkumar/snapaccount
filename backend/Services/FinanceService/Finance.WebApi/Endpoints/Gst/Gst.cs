using GstService.Application.GstReturns.Queries.GetFilingQueue;
using GstService.Application.EInvoices.Commands.GenerateEInvoice;
using GstService.Application.EInvoices.Commands.SetGstOrgProfile;
using GstService.Application.EInvoices.Queries.GetGstOrgProfile;
using GstService.Application.EWayBills.Commands.CreateEWayBill;
using GstService.Application.GstReturns.Commands.ApproveReturn;
using GstService.Application.GstReturns.Commands.CreateGstReturn;
using GstService.Application.GstReturns.Commands.FileNilReturn;
using GstService.Application.GstReturns.Commands.FileReturn;
using GstService.Application.GstReturns.Commands.RequestRevision;
using GstService.Application.GstReturns.Commands.SubmitForApproval;
using GstService.Application.GstReturns.Commands.UpdateReturnArn;
using GstService.Application.GstReturns.Queries.GetGstReturn;
using GstService.Application.GstReturns.Queries.GetGstReturnAudit;
using GstService.Application.GstReturns.Queries.GetLateFeePreview;
using GstService.Application.GstReturns.Queries.ListGstReturns;
using GstService.Application.HsnSac.Queries.SearchHsnSac;
using GstService.Application.Invoices.Commands.AddReturnInvoice;
using GstService.Application.Invoices.Commands.BulkImportInvoices;
using GstService.Application.Invoices.Commands.CreateGstInvoice;
using GstService.Application.Invoices.Queries.ListGstInvoices;
using GstService.Application.Invoices.Queries.ListReturnInvoices;
using GstService.Application.Admin.Queries.GetUserReturns;
using GstService.Application.Dashboard.Queries.GetActivity;
using GstService.Application.Dashboard.Queries.GetDashboardStats;
using GstService.Application.Dashboard.Queries.GetNoticesDueSummary;
using GstService.Application.Dashboard.Queries.GetWorkloadByUser;
using GstService.Application.ItcReconciliation.Commands.ReconcileItc;
using GstService.Application.ItcReconciliation.Queries.GetItcMismatches;
using GstService.Application.Notices.Commands.AssignNoticeToCa;
using GstService.Application.Notices.Commands.CreateNotice;
using GstService.Application.Notices.Commands.RespondToNotice;
using GstService.Application.Notices.Queries.GetNotice;
using GstService.Application.Notices.Queries.ListNotices;
using MediatR;
using SnapAccount.Shared.Api;

namespace GstService.Api.Endpoints;

/// <summary>
/// All /gst endpoints — returns, ITC mismatches, invoices, notices, e-invoices, e-way bills, HSN/SAC search.
/// Phase 6B: all 501 stubs replaced with real handlers.
/// Inherits <see cref="EndpointGroupBase"/>; discovered automatically.
/// </summary>
public sealed class Gst : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/gst";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Returns ──────────────────────────────────────────────────────────
        groupBuilder.MapPost("/returns", CreateGstReturn)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapGet("/returns", ListGstReturns)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapGet("/returns/{id:guid}", GetGstReturn)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapPost("/returns/{id:guid}/submit", SubmitForApproval)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapPost("/returns/{id:guid}/approve", ApproveReturn)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapPost("/returns/{id:guid}/file", FileReturn)
            .RequireAuthorization().RequireRateLimiting("standard");

        // DG-GST-02: PATCH /gst/returns/{id}/arn — capture / correct the ARN after filing
        groupBuilder.MapPatch("/returns/{id:guid}/arn", UpdateReturnArn)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("UpdateGstReturnArn")
            .WithSummary("Capture or correct the ARN for a filed GST return.");

        // DG-GST-02: GET /gst/returns/{id}/audit — paginated state-transition audit trail
        groupBuilder.MapGet("/returns/{id:guid}/audit", GetGstReturnAudit)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstReturnAudit")
            .WithSummary("Paginated audit trail of state transitions and ARN edits for a GST return.");

        // POST /gst/returns/{id}/revision — flag a return for revision (CA/Admin only)
        groupBuilder.MapPost("/returns/{id:guid}/revision", RequestRevision)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RequestGstReturnRevision")
            .WithSummary("Flags a pending/approved GST return as needing revision.");

        // Phase 6B: nil-return filing
        groupBuilder.MapPost("/returns/nil", FileNilReturn)
            .RequireAuthorization().RequireRateLimiting("standard");

        // Phase 6B: invoices per return
        groupBuilder.MapPost("/returns/{id:guid}/invoices", AddReturnInvoice)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapGet("/returns/{id:guid}/invoices", ListReturnInvoices)
            .RequireAuthorization().RequireRateLimiting("standard");

        // ── Invoices ─────────────────────────────────────────────────────────
        groupBuilder.MapGet("/invoices", ListGstInvoices)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapPost("/invoices", CreateGstInvoice)
            .RequireAuthorization().RequireRateLimiting("standard");

        // Phase 6B: bulk import
        groupBuilder.MapPost("/invoices/bulk-import", BulkImportInvoices)
            .RequireAuthorization().RequireRateLimiting("standard");

        // ── ITC Mismatches ───────────────────────────────────────────────────
        groupBuilder.MapGet("/itc-mismatches", GetItcMismatches)
            .RequireAuthorization().RequireRateLimiting("standard");

        // POST /gst/itc-reconciliation — runs ITC reconciliation for org+period.
        groupBuilder.MapPost("/itc-reconciliation", ReconcileItc)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ReconcileItc");

        // ── Notices (Phase 6B — all real handlers) ───────────────────────────
        groupBuilder.MapGet("/notices", ListNotices)
            .RequireAuthorization().RequireRateLimiting("standard");

        // GET /gst/notices/due-summary — overdue / due-soon counts for the admin dashboard
        // NoticesDueWidget. SUPER_ADMIN only. Declared before the {id:guid} route for clarity
        // (the guid constraint already prevents "due-summary" from matching that route).
        groupBuilder.MapGet("/notices/due-summary", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetNoticesDueSummaryQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstNoticesDueSummary")
            .WithSummary("Overdue / due-soon GST notice counts for the admin dashboard widget.");

        groupBuilder.MapGet("/notices/{id:guid}", GetNotice)
            .RequireAuthorization().RequireRateLimiting("standard");

        // SEC-043: stricter 30 req/min to limit notice spam and IRP API cost
        groupBuilder.MapPost("/notices", CreateNotice)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict");

        groupBuilder.MapPost("/notices/{id:guid}/respond", RespondToNotice)
            .RequireAuthorization().RequireRateLimiting("standard");

        groupBuilder.MapPost("/notices/{id:guid}/assign-ca", AssignNoticeToCa)
            .RequireAuthorization().RequireRateLimiting("standard");

        // ── E-Invoice (Phase 6B) ─────────────────────────────────────────────
        // SEC-043: stricter 30 req/min to limit IRP API cost
        groupBuilder.MapPost("/e-invoices", GenerateEInvoice)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict");

        // DG-GST-05: org profile (annual turnover → e-invoice threshold gate)
        groupBuilder.MapGet("/org-profile/{organizationId:guid}", GetGstOrgProfile)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstOrgProfile")
            .WithSummary("Get the GST org profile (annual turnover + e-invoice flag) for an organisation.");

        groupBuilder.MapPut("/org-profile/{organizationId:guid}", SetGstOrgProfile)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("SetGstOrgProfile")
            .WithSummary("Create or update the GST org profile (annual turnover + e-invoice flag).");

        // DG-GST-04: late-fee preview before filing
        groupBuilder.MapGet("/returns/{id:guid}/late-fee-preview", GetLateFeePreview)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstReturnLateFeePreview")
            .WithSummary("Preview late fee and interest for a GST return if filed today (or at a given date).");

        // ── E-Way Bills (Phase 6B) ────────────────────────────────────────────
        groupBuilder.MapPost("/e-way-bills", CreateEWayBill)
            .RequireAuthorization().RequireRateLimiting("standard");

        // ── HSN/SAC (Phase 6B) ────────────────────────────────────────────────
        groupBuilder.MapGet("/hsn-sac/search", SearchHsnSac)
            .RequireAuthorization().RequireRateLimiting("standard");

        // GET /gst/admin/dashboard-stats — admin-only count for cross-service dashboard
        groupBuilder.MapGet("/admin/dashboard-stats", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstAdminDashboardStats")
            .WithSummary("GST returns due today for the admin cross-service dashboard.");

        // GET /gst/admin/activity?range=7D|30D|90D — daily return-creation series
        groupBuilder.MapGet("/admin/activity", static async (string? range, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetActivityQuery(range ?? "7D"), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstAdminActivity")
            .WithSummary("Daily GST return creation counts for the cross-service activity chart.");

        // GET /gst/admin/orgs/{organizationId}/returns?limit=N — recent returns for a user's org
        groupBuilder.MapGet("/admin/orgs/{organizationId:guid}/returns", static async (
            Guid organizationId, int? limit, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetUserReturnsQuery(organizationId, limit ?? 20), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetAdminOrgGstReturns")
            .WithSummary("Recent GST returns for a specific organisation — admin per-user detail view.");

        // GET /gst/admin/filing-queue?status=&limit= — CA assignment queue ordered by SLA
        groupBuilder.MapGet("/admin/filing-queue", static async (
            string? status, int? limit, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetFilingQueueQuery(status, limit ?? 50), ct);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstAdminFilingQueue")
            .WithSummary("CA filing queue — GST returns ordered by SLA expiry for admin assignment.");

        // GET /gst/admin/workload-by-user — per-CA GST notice workload (Team workload grid, Screen 89)
        groupBuilder.MapGet("/admin/workload-by-user", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetWorkloadByUserQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetGstAdminWorkloadByUser")
            .WithSummary("Per-assignee GST notice workload — admin team-workload grid.");
    }

    // ── Return handlers ───────────────────────────────────────────────────────

    private static async Task<IResult> CreateGstReturn(CreateGstReturnRequest req, ISender sender)
    {
        var result = await sender.Send(new CreateGstReturnCommand(
            req.OrganizationId, req.ReturnType, req.FinancialYear,
            req.Gstin, req.PeriodMonth, req.FilingDeadline));
        return result.IsSuccess
            ? Results.Created($"/gst/returns/{result.Value.GstReturnId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // WEB-10 FIX: organizationId is now nullable — missing param returns 400 (not 500 binding error).
    private static async Task<IResult> ListGstReturns(
        ISender sender, Guid? organizationId = null, string? status = null, string? returnType = null, int page = 1, int pageSize = 20)
    {
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });
        var result = await sender.Send(new ListGstReturnsQuery(organizationId.Value, status, returnType, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetGstReturn(Guid id, ISender sender)
    {
        var result = await sender.Send(new GetGstReturnQuery(id));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(new { error = result.Error.Message });
    }

    private static async Task<IResult> SubmitForApproval(Guid id, ISender sender)
    {
        var result = await sender.Send(new SubmitForApprovalCommand(id));
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> ApproveReturn(Guid id, ISender sender)
    {
        var result = await sender.Send(new ApproveReturnCommand(id));
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> FileReturn(Guid id, FileReturnRequest req, ISender sender)
    {
        var result = await sender.Send(new FileReturnCommand(id, req.ArnNumber));
        // DG-GST-04: Return 200 with penalty summary instead of 204 so the caller
        // can surface any late fee / interest to the user immediately after filing.
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> FileNilReturn(FileNilReturnRequest req, ISender sender)
    {
        var result = await sender.Send(new FileNilReturnCommand(
            req.GstReturnId, req.Gstin, req.ReturnType, req.Year, req.Month));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> AddReturnInvoice(Guid id, AddReturnInvoiceRequest req, ISender sender)
    {
        var result = await sender.Send(new AddReturnInvoiceCommand(
            id, req.OrganizationId, req.InvoiceType, req.InvoiceNumber, req.InvoiceDate,
            req.SupplierGstin, req.SupplierName, req.TaxableValue,
            req.IgstAmount, req.CgstAmount, req.SgstAmount, req.CessAmount,
            req.BuyerName, req.BuyerGstin));
        return result.IsSuccess
            ? Results.Created($"/gst/returns/{id}/invoices/{result.Value.InvoiceId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> ListReturnInvoices(
        Guid id, ISender sender, Guid? organizationId, int page = 1, int pageSize = 50)
    {
        // SWEEP-B FIX: organizationId is nullable — missing query param returns 400, not 500 binding error.
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });
        var result = await sender.Send(new ListReturnInvoicesQuery(id, organizationId.Value, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    // ── Invoice handlers ──────────────────────────────────────────────────────

    private static async Task<IResult> ListGstInvoices(
        ISender sender, Guid? organizationId, string? invoiceType = null, string? status = null, int page = 1, int pageSize = 20)
    {
        // SWEEP-B FIX: organizationId is nullable — missing query param returns 400, not 500 binding error.
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });
        var result = await sender.Send(new ListGstInvoicesQuery(organizationId.Value, invoiceType, status, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> CreateGstInvoice(CreateGstInvoiceRequest req, ISender sender)
    {
        var command = new CreateGstInvoiceCommand(
            req.OrganizationId, req.InvoiceType, req.InvoiceNumber, req.InvoiceDate,
            req.SupplierGstin, req.SupplierName, req.TaxableValue,
            req.IgstAmount, req.CgstAmount, req.SgstAmount, req.CessAmount,
            req.BuyerName, req.BuyerGstin);
        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.Created($"/gst/invoices/{result.Value.InvoiceId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> BulkImportInvoices(BulkImportRequest req, ISender sender)
    {
        var items = req.Invoices.Select(i => new BulkInvoiceItem(
            i.InvoiceType, i.InvoiceNumber, i.InvoiceDate,
            i.SupplierGstin, i.SupplierName,
            i.TaxableValue, i.IgstAmount, i.CgstAmount, i.SgstAmount, i.CessAmount,
            i.BuyerName, i.BuyerGstin)).ToList();
        var result = await sender.Send(new BulkImportInvoicesCommand(req.OrganizationId, req.GstReturnId, items));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetItcMismatches(
        ISender sender, Guid? organizationId, string? status = "OPEN")
    {
        // SWEEP-B FIX: organizationId is nullable — missing query param returns 400, not 500 binding error.
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });
        var result = await sender.Send(new GetItcMismatchesQuery(organizationId.Value, status));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> ReconcileItc(ReconcileItcRequest req, ISender sender)
    {
        var result = await sender.Send(new ReconcileItcCommand(
            req.OrganizationId, req.FinancialYear, req.PeriodMonth, req.ReconciliationType ?? "GSTR_2B"));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // ── Notice handlers ───────────────────────────────────────────────────────

    // WEB-FIX: organizationId is now nullable — when absent the handler defaults to
    // ICurrentUser.OrganizationId (so the admin GST Notices page works without passing it explicitly).
    // GAP-108: formType, appealStage, gstatBacklogOnly filters added.
    // Mobile compatibility shim: legacy status values (Open, Overdue) from pre-Wave-7C app builds
    // are mapped to the canonical vocabulary (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED) so old app
    // installs do not receive 400s. New builds should send the canonical values.
    // Shim is intentionally at the endpoint (not the validator) to keep the query layer clean.
    // DEPRECATED: legacy values will be removed in a future release once all app builds are ≥ Wave 7C.
    private static async Task<IResult> ListNotices(
        ISender sender,
        Guid? organizationId = null,
        string? status = null,
        string? formType = null,
        string? appealStage = null,
        bool? gstatBacklogOnly = null,
        int page = 1,
        int pageSize = 20)
    {
        // ── Legacy status shim (DEPRECATED) ─────────────────────────────────────
        // Maps pre-Wave-7C mobile values → canonical GstNotice status vocabulary.
        // "Open"    → "RECEIVED"      (new/open notices — closest equivalent)
        // "Overdue" → "UNDER_REVIEW"  (overdue is a superset; UNDER_REVIEW keeps them visible)
        // "Responded" → "RESPONDED"   (same casing, map for safety)
        // "Closed"    → "CLOSED"      (same casing, map for safety)
        // Unknown legacy values fall through to the validator (will 400 with a clear message).
        var canonicalStatus = status switch
        {
            "Open"      => "RECEIVED",
            "Overdue"   => "UNDER_REVIEW",
            "Responded" => "RESPONDED",
            "Closed"    => "CLOSED",
            _           => status // null or already canonical — pass through
        };

        var result = await sender.Send(new ListNoticesQuery(organizationId, canonicalStatus, formType, appealStage, gstatBacklogOnly, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetNotice(Guid id, ISender sender)
    {
        var result = await sender.Send(new GetNoticeQuery(id));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(new { error = result.Error.Message });
    }

    private static async Task<IResult> CreateNotice(CreateNoticeRequest req, ISender sender)
    {
        var result = await sender.Send(new CreateNoticeCommand(
            req.OrganizationId, req.NoticeNumber, req.NoticeType,
            req.IssuedBy, req.IssuedDate, req.DueDate, req.Description, req.FormType, req.Gstin));
        return result.IsSuccess
            ? Results.Created($"/gst/notices/{result.Value.NoticeId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> RespondToNotice(Guid id, RespondToNoticeRequest req, ISender sender)
    {
        var result = await sender.Send(new RespondToNoticeCommand(
            id, req.RespondedByUserId, req.ResponseText, req.ResponseAttachmentMetadataJson));
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> AssignNoticeToCa(Guid id, AssignCaRequest req, ISender sender)
    {
        var result = await sender.Send(new AssignNoticeToCaCommand(id, req.CaUserId));
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // ── E-Invoice / E-Way Bill ────────────────────────────────────────────────

    private static async Task<IResult> GenerateEInvoice(GenerateEInvoiceRequest req, ISender sender)
    {
        var result = await sender.Send(new GenerateEInvoiceCommand(req.GstInvoiceId));
        return result.IsSuccess
            ? Results.Created($"/gst/e-invoices/{result.Value.IrnNumber}", result.Value)
            : result.Error.ToHttpResult();
    }

    // DG-GST-05: org profile endpoints

    private static async Task<IResult> GetGstOrgProfile(Guid organizationId, ISender sender)
    {
        var result = await sender.Send(new GetGstOrgProfileQuery(organizationId));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> SetGstOrgProfile(
        Guid organizationId, SetGstOrgProfileRequest req, ISender sender)
    {
        var result = await sender.Send(new SetGstOrgProfileCommand(
            organizationId, req.AnnualTurnoverCr, req.EInvoiceEnabled, req.EffectiveFromFy));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    // DG-GST-04: late-fee preview endpoint

    private static async Task<IResult> GetLateFeePreview(
        Guid id, ISender sender, DateTime? asOf = null)
    {
        var result = await sender.Send(new GetLateFeePreviewQuery(id, asOf));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> CreateEWayBill(CreateEWayBillRequest req, ISender sender)
    {
        var result = await sender.Send(new CreateEWayBillCommand(
            req.OrganizationId, req.GstInvoiceId, req.SupplyType,
            req.TotalValue, req.FromPlace, req.ToPlace, req.VehicleNumber));
        return result.IsSuccess
            ? Results.Created($"/gst/e-way-bills/{result.Value.EwbNumber}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // ── HSN/SAC ───────────────────────────────────────────────────────────────

    private static async Task<IResult> SearchHsnSac(
        ISender sender,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = "query")] string? query = null,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = "q")] string? q = null,
        string? codeType = null,
        int limit = 20)
    {
        // BUG-GST-HSN-SEARCH-PARAM: docs/api/endpoints.md documents the term as ?query, while the
        // original handler bound a required ?q. Accept both (documented "query" wins) so clients
        // built to either contract work.
        var term = !string.IsNullOrWhiteSpace(query) ? query : q;
        if (string.IsNullOrWhiteSpace(term))
            return Results.BadRequest(new { error = "The 'query' parameter is required." });

        var result = await sender.Send(new SearchHsnSacQuery(term, codeType, limit));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    // ── DG-GST-02: ARN capture + audit trail ──────────────────────────────────

    private static async Task<IResult> UpdateReturnArn(Guid id, UpdateReturnArnRequest req, ISender sender)
    {
        var result = await sender.Send(new UpdateReturnArnCommand(id, req.Arn));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetGstReturnAudit(
        Guid id, ISender sender, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new GetGstReturnAuditQuery(id, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> RequestRevision(Guid id, RequestRevisionRequest req, ISender sender)
    {
        var result = await sender.Send(new RequestRevisionCommand(id, req.Note));
        return result.IsSuccess ? Results.NoContent() : result.Error.ToHttpResult();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

internal record CreateGstReturnRequest(
    Guid OrganizationId, string ReturnType, string FinancialYear, string Gstin,
    int? PeriodMonth = null, DateOnly? FilingDeadline = null);

internal record FileReturnRequest(string ArnNumber);

internal record FileNilReturnRequest(Guid GstReturnId, string Gstin, string ReturnType, int Year, int Month);
internal record ReconcileItcRequest(
    Guid OrganizationId, string FinancialYear, int PeriodMonth, string? ReconciliationType = "GSTR_2B");

internal record AddReturnInvoiceRequest(
    Guid OrganizationId, string InvoiceType, string InvoiceNumber, DateOnly InvoiceDate,
    string SupplierGstin, string SupplierName, decimal TaxableValue,
    decimal IgstAmount, decimal CgstAmount, decimal SgstAmount, decimal CessAmount,
    string? BuyerName = null, string? BuyerGstin = null);

internal record CreateGstInvoiceRequest(
    Guid OrganizationId, string InvoiceType, string InvoiceNumber, DateOnly InvoiceDate,
    string SupplierGstin, string SupplierName, decimal TaxableValue,
    decimal IgstAmount, decimal CgstAmount, decimal SgstAmount, decimal CessAmount,
    string? BuyerName = null, string? BuyerGstin = null);

internal record BulkImportRequest(Guid OrganizationId, Guid? GstReturnId, IReadOnlyList<BulkImportInvoiceDto> Invoices);

internal record BulkImportInvoiceDto(
    string InvoiceType, string InvoiceNumber, DateOnly InvoiceDate,
    string SupplierGstin, string SupplierName, decimal TaxableValue,
    decimal IgstAmount, decimal CgstAmount, decimal SgstAmount, decimal CessAmount,
    string? BuyerName = null, string? BuyerGstin = null);

internal record CreateNoticeRequest(
    Guid OrganizationId, string NoticeNumber, string NoticeType, string? IssuedBy,
    DateOnly IssuedDate, DateOnly? DueDate = null, string? Description = null,
    GstService.Domain.Enums.GstNoticeFormType FormType = GstService.Domain.Enums.GstNoticeFormType.OTHER,
    string? Gstin = null);

internal record RespondToNoticeRequest(
    Guid RespondedByUserId, string? ResponseText, string? ResponseAttachmentMetadataJson);

internal record AssignCaRequest(Guid CaUserId);

internal record GenerateEInvoiceRequest(Guid GstInvoiceId);

internal record CreateEWayBillRequest(
    Guid OrganizationId, Guid? GstInvoiceId, string SupplyType, decimal TotalValue,
    string? FromPlace = null, string? ToPlace = null, string? VehicleNumber = null);

// DG-GST-02: ARN capture + revision request DTOs
internal record UpdateReturnArnRequest(string Arn);
internal record RequestRevisionRequest(string Note);

// DG-GST-05: org profile upsert request DTO
internal record SetGstOrgProfileRequest(
    decimal? AnnualTurnoverCr,
    bool EInvoiceEnabled = false,
    string? EffectiveFromFy = null);
