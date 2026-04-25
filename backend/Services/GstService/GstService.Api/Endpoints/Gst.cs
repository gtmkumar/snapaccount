using GstService.Application.EInvoices.Commands.GenerateEInvoice;
using GstService.Application.EWayBills.Commands.CreateEWayBill;
using GstService.Application.GstReturns.Commands.ApproveReturn;
using GstService.Application.GstReturns.Commands.CreateGstReturn;
using GstService.Application.GstReturns.Commands.FileNilReturn;
using GstService.Application.GstReturns.Commands.FileReturn;
using GstService.Application.GstReturns.Commands.SubmitForApproval;
using GstService.Application.GstReturns.Queries.GetGstReturn;
using GstService.Application.GstReturns.Queries.ListGstReturns;
using GstService.Application.HsnSac.Queries.SearchHsnSac;
using GstService.Application.Invoices.Commands.AddReturnInvoice;
using GstService.Application.Invoices.Commands.BulkImportInvoices;
using GstService.Application.Invoices.Commands.CreateGstInvoice;
using GstService.Application.Invoices.Queries.ListGstInvoices;
using GstService.Application.Invoices.Queries.ListReturnInvoices;
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

        // ── Notices (Phase 6B — all real handlers) ───────────────────────────
        groupBuilder.MapGet("/notices", ListNotices)
            .RequireAuthorization().RequireRateLimiting("standard");

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

        // ── E-Way Bills (Phase 6B) ────────────────────────────────────────────
        groupBuilder.MapPost("/e-way-bills", CreateEWayBill)
            .RequireAuthorization().RequireRateLimiting("standard");

        // ── HSN/SAC (Phase 6B) ────────────────────────────────────────────────
        groupBuilder.MapGet("/hsn-sac/search", SearchHsnSac)
            .RequireAuthorization().RequireRateLimiting("standard");
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

    private static async Task<IResult> ListGstReturns(
        ISender sender, Guid organizationId, string? status = null, string? returnType = null, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new ListGstReturnsQuery(organizationId, status, returnType, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
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
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
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
        Guid id, ISender sender, Guid organizationId, int page = 1, int pageSize = 50)
    {
        var result = await sender.Send(new ListReturnInvoicesQuery(id, organizationId, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    // ── Invoice handlers ──────────────────────────────────────────────────────

    private static async Task<IResult> ListGstInvoices(
        ISender sender, Guid organizationId, string? invoiceType = null, string? status = null, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new ListGstInvoicesQuery(organizationId, invoiceType, status, page, pageSize));
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
        ISender sender, Guid organizationId, string? status = "OPEN")
    {
        var result = await sender.Send(new GetItcMismatchesQuery(organizationId, status));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    // ── Notice handlers ───────────────────────────────────────────────────────

    private static async Task<IResult> ListNotices(
        ISender sender, Guid organizationId, string? status = null, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new ListNoticesQuery(organizationId, status, page, pageSize));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
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
            req.IssuedBy, req.IssuedDate, req.DueDate, req.Description));
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
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
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
        ISender sender, string q, string? codeType = null, int limit = 20)
    {
        var result = await sender.Send(new SearchHsnSacQuery(q, codeType, limit));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

internal record CreateGstReturnRequest(
    Guid OrganizationId, string ReturnType, string FinancialYear, string Gstin,
    int? PeriodMonth = null, DateOnly? FilingDeadline = null);

internal record FileReturnRequest(string ArnNumber);

internal record FileNilReturnRequest(Guid GstReturnId, string Gstin, string ReturnType, int Year, int Month);

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
    DateOnly IssuedDate, DateOnly? DueDate = null, string? Description = null);

internal record RespondToNoticeRequest(
    Guid RespondedByUserId, string? ResponseText, string? ResponseAttachmentMetadataJson);

internal record AssignCaRequest(Guid CaUserId);

internal record GenerateEInvoiceRequest(Guid GstInvoiceId);

internal record CreateEWayBillRequest(
    Guid OrganizationId, Guid? GstInvoiceId, string SupplyType, decimal TotalValue,
    string? FromPlace = null, string? ToPlace = null, string? VehicleNumber = null);
