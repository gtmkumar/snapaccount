using GstService.Application.Gstr1a.Commands.CreateGstr1aAmendment;
using GstService.Application.Gstr1a.Queries.ListGstr1aAmendments;
using GstService.Application.Ims.Commands.ActOnImsInvoice;
using GstService.Application.Ims.Commands.BulkActOnImsInvoices;
using GstService.Application.Ims.Commands.FetchImsInvoices;
using GstService.Application.Ims.Queries.GetImsInvoice;
using GstService.Application.Ims.Queries.GetImsSummary;
using GstService.Application.Ims.Queries.ListImsInvoices;
using MediatR;
using SnapAccount.Shared.Api;

namespace GstService.Api.Endpoints;

/// <summary>
/// IMS (Invoice Management System) endpoints — GAP-101 regulatory requirement.
/// Mandatory from 1 Apr 2026: taxpayers must accept/reject each inward invoice
/// before GSTR-2B is generated. GSTR-3B Table 3 is hard-locked after filing.
///
/// NEW permissions required (see DDL handoff section for seeding):
///   gst.ims.read    — list / get IMS invoices and summary
///   gst.ims.action  — accept / reject / keep-pending IMS invoices
///   gst.ims.sync    — trigger GSTN IMS pull
///   gst.gstr1a.read   — list GSTR-1A amendments
///   gst.gstr1a.create — create GSTR-1A amendment drafts
/// </summary>
public sealed class GstIms : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/gst";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── IMS Invoice Inbox ────────────────────────────────────────────────

        // GET /gst/ims/invoices?organizationId=&period=&status=&supplierGstin=&search=&page=&pageSize=
        groupBuilder.MapGet("/ims/invoices", ListImsInvoices)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListImsInvoices")
            .WithSummary("List inward invoices visible in the GSTN IMS inbox (paginated, filterable).")
            .WithDescription(
                "Returns supplier-reported inward invoices for a given period. " +
                "Taxpayers must action each invoice before the GSTR-2B generation deadline (14th of following month). " +
                "Rate limit: 100 req/min.");

        // GET /gst/ims/invoices/{id}?organizationId=
        groupBuilder.MapGet("/ims/invoices/{id:guid}", GetImsInvoice)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetImsInvoice")
            .WithSummary("Get full detail of a single IMS invoice including action log history.");

        // POST /gst/ims/invoices/{id}/action
        groupBuilder.MapPost("/ims/invoices/{id:guid}/action", ActOnImsInvoice)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict")
            .WithName("ActOnImsInvoice")
            .WithSummary("Accept, reject, or mark as pending-kept a single IMS invoice. Idempotent.")
            .WithDescription(
                "Action is idempotent for the same status transition. " +
                "Cannot reject an accepted invoice — use POST /gst/gstr1a instead. " +
                "Rate limit: 30 req/min (GSTN API cost).");

        // POST /gst/ims/actions/bulk
        groupBuilder.MapPost("/ims/actions/bulk", BulkActOnImsInvoices)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict")
            .WithName("BulkActOnImsInvoices")
            .WithSummary("Apply IMS actions to up to 100 invoices in a single request.")
            .WithDescription(
                "Bulk limit: 100 invoices per request (GSTN rate limit). " +
                "Returns per-invoice results including success/failure/skipped counts. " +
                "Rate limit: 30 req/min.");

        // GET /gst/ims/summary?organizationId=&period=
        groupBuilder.MapGet("/ims/summary", GetImsSummary)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetImsSummary")
            .WithSummary("IMS status counts by period + GSTR-2B generation deadline information.")
            .WithDescription(
                "Returns PENDING/ACCEPTED/REJECTED/PENDING_KEPT counts, total invoice values, " +
                "GSTR-2B deadline date (14th of following month), and whether deemed-acceptance has triggered.");

        // POST /gst/ims/sync
        groupBuilder.MapPost("/ims/sync", SyncImsInvoices)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict")
            .WithName("SyncImsInvoices")
            .WithSummary("Pull inward invoices from GSTN IMS into local store for the given period.")
            .WithDescription(
                "Upsert semantics: new invoices inserted; existing records (matched by supplier GSTIN + invoice number + period) " +
                "are left unchanged to preserve local action status. " +
                "Safe to call repeatedly (idempotent). Rate limit: 30 req/min.");

        // ── GSTR-1A Amendments ───────────────────────────────────────────────

        // POST /gst/gstr1a
        groupBuilder.MapPost("/gstr1a", CreateGstr1aAmendment)
            .RequireAuthorization().RequireRateLimiting("gst-write-strict")
            .WithName("CreateGstr1aAmendment")
            .WithSummary("Create a GSTR-1A amendment draft (only mechanism to correct GSTR-3B Table 3 post-filing).")
            .WithDescription(
                "GSTR-1A is the correction route when a taxpayer has rejected an IMS invoice and the supplier needs to amend their return. " +
                "Amendment types: B2B_AMENDMENT, B2BA, CDNR_AMENDMENT, CDNRA. " +
                "Rate limit: 30 req/min.");

        // GET /gst/gstr1a?organizationId=&period=&status=&page=&pageSize=
        groupBuilder.MapGet("/gstr1a", ListGstr1aAmendments)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListGstr1aAmendments")
            .WithSummary("List GSTR-1A amendment drafts for an organisation.");
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> ListImsInvoices(
        ISender sender,
        Guid? organizationId = null,
        string? period = null,
        string? status = null,
        string? supplierGstin = null,
        string? search = null,
        int page = 1,
        int pageSize = 20)
    {
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });

        var result = await sender.Send(new ListImsInvoicesQuery(
            organizationId.Value, period, status, supplierGstin, search, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetImsInvoice(Guid id, ISender sender, Guid? organizationId = null)
    {
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });

        var result = await sender.Send(new GetImsInvoiceQuery(id, organizationId.Value));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> ActOnImsInvoice(
        Guid id, ActOnImsInvoiceRequest req, ISender sender)
    {
        var result = await sender.Send(new ActOnImsInvoiceCommand(
            InvoiceId: id,
            OrganizationId: req.OrganizationId,
            Action: req.Action,
            Reason: req.Reason,
            ActionedBy: req.ActionedBy));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> BulkActOnImsInvoices(BulkActOnImsInvoicesRequest req, ISender sender)
    {
        var items = req.Items
            .Select(i => new BulkImsActionItem(i.InvoiceId, i.Action, i.Reason))
            .ToList();
        var result = await sender.Send(new BulkActOnImsInvoicesCommand(req.OrganizationId, req.ActionedBy, items));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> GetImsSummary(
        ISender sender, Guid? organizationId = null, string? period = null)
    {
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });
        if (string.IsNullOrEmpty(period))
            return Results.BadRequest(new { error = "period query parameter is required (MMYYYY format).", code = "GST.MissingPeriod" });

        var result = await sender.Send(new GetImsSummaryQuery(organizationId.Value, period));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> SyncImsInvoices(SyncImsInvoicesRequest req, ISender sender)
    {
        var result = await sender.Send(new FetchImsInvoicesCommand(req.OrganizationId, req.Gstin, req.Period));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    private static async Task<IResult> CreateGstr1aAmendment(CreateGstr1aAmendmentRequest req, ISender sender)
    {
        var result = await sender.Send(new CreateGstr1aAmendmentCommand(
            OrganizationId: req.OrganizationId,
            OriginalImsInvoiceId: req.OriginalImsInvoiceId,
            OriginalInvoiceNumber: req.OriginalInvoiceNumber,
            OriginalSupplierGstin: req.OriginalSupplierGstin,
            AmendmentType: req.AmendmentType,
            AmendmentPayloadJson: req.AmendmentPayloadJson,
            Period: req.Period));
        return result.IsSuccess
            ? Results.Created($"/gst/gstr1a/{result.Value.AmendmentId}", result.Value)
            : result.Error.ToHttpResult();
    }

    private static async Task<IResult> ListGstr1aAmendments(
        ISender sender,
        Guid? organizationId = null,
        string? period = null,
        string? status = null,
        int page = 1,
        int pageSize = 20)
    {
        if (!organizationId.HasValue)
            return Results.BadRequest(new { error = "organizationId query parameter is required.", code = "GST.MissingOrganizationId" });

        var result = await sender.Send(new ListGstr1aAmendmentsQuery(organizationId.Value, period, status, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>Request body for acting on a single IMS invoice.</summary>
internal record ActOnImsInvoiceRequest(
    Guid OrganizationId,
    Guid ActionedBy,
    string Action,
    string? Reason = null);

/// <summary>Request body for bulk IMS invoice actions.</summary>
internal record BulkActOnImsInvoicesRequest(
    Guid OrganizationId,
    Guid ActionedBy,
    IReadOnlyList<BulkImsActionItemRequest> Items);

/// <summary>One item in a bulk action request body.</summary>
internal record BulkImsActionItemRequest(
    Guid InvoiceId,
    string Action,
    string? Reason = null);

/// <summary>Request body for GSTN IMS sync.</summary>
internal record SyncImsInvoicesRequest(
    Guid OrganizationId,
    string Gstin,
    string Period);

/// <summary>Request body for creating a GSTR-1A amendment draft.</summary>
internal record CreateGstr1aAmendmentRequest(
    Guid OrganizationId,
    string OriginalInvoiceNumber,
    string OriginalSupplierGstin,
    string AmendmentType,
    string AmendmentPayloadJson,
    string Period,
    Guid? OriginalImsInvoiceId = null);
