using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Queries.ListGstInvoices;

/// <summary>
/// Returns paginated list of GST invoices for an organisation.
/// Phase 6A: replaces the 501 stub for GET /gst/invoices.
/// </summary>
public record ListGstInvoicesQuery(
    Guid OrganizationId,
    string? InvoiceType = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListGstInvoicesDto>;

/// <summary>Paginated invoice list DTO.</summary>
public record ListGstInvoicesDto(
    IReadOnlyList<GstInvoiceSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Invoice summary row.</summary>
public record GstInvoiceSummary(
    Guid Id,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    string? BuyerName,
    string? BuyerGstin,
    decimal TaxableValue,
    decimal TotalGst,
    decimal TotalAmount,
    string Status);

/// <summary>Handles <see cref="ListGstInvoicesQuery"/>.</summary>
public sealed class ListGstInvoicesQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListGstInvoicesQuery, ListGstInvoicesDto>
{
    /// <inheritdoc />
    public async Task<Result<ListGstInvoicesDto>> Handle(
        ListGstInvoicesQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.GstInvoices
            .Where(i => i.OrganizationId == request.OrganizationId && i.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.InvoiceType))
            query = query.Where(i => i.InvoiceType == request.InvoiceType);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(i => i.IrnStatus == request.Status);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(i => i.InvoiceDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(i => new GstInvoiceSummary(
                i.Id,
                i.InvoiceNumber,
                i.InvoiceDate,
                i.BuyerName,
                i.BuyerGstin,
                i.TaxableValue,
                i.IgstAmount + i.CgstAmount + i.SgstAmount + i.CessAmount,
                i.TotalInvoiceValue,
                i.IrnStatus ?? "DRAFT"))
            .ToListAsync(cancellationToken);

        return new ListGstInvoicesDto(items, total, request.Page, request.PageSize);
    }
}
