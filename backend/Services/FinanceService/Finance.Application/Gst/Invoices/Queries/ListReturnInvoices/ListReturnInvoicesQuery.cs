using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Queries.ListReturnInvoices;

/// <summary>
/// Returns invoices for a specific GST return (GET /gst/returns/{id}/invoices).
/// P6-HANDOFF-13: reads from canonical gst.invoices table.
/// Phase 6B: replaces the 501 stub.
/// </summary>
public record ListReturnInvoicesQuery(
    Guid GstReturnId,
    Guid OrganizationId,
    int Page = 1,
    int PageSize = 50) : IQuery<ListReturnInvoicesResponse>;

/// <summary>Paginated invoices for a return.</summary>
public record ListReturnInvoicesResponse(
    IReadOnlyList<ReturnInvoiceDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Invoice summary DTO.</summary>
public record ReturnInvoiceDto(
    Guid InvoiceId,
    string InvoiceType,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    string SupplierGstin,
    string SupplierName,
    string? BuyerGstin,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    decimal TotalInvoiceValue,
    string? IrnStatus);

/// <summary>Validator for list return invoices query.</summary>
public sealed class ListReturnInvoicesQueryValidator : AbstractValidator<ListReturnInvoicesQuery>
{
    public ListReturnInvoicesQueryValidator()
    {
        RuleFor(x => x.GstReturnId).NotEmpty();
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

/// <summary>Handler for <see cref="ListReturnInvoicesQuery"/>.</summary>
public sealed class ListReturnInvoicesQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListReturnInvoicesQuery, ListReturnInvoicesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListReturnInvoicesResponse>> Handle(
        ListReturnInvoicesQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.GstInvoices
            .Where(i => i.GstReturnId == request.GstReturnId
                && i.OrganizationId == request.OrganizationId
                && i.DeletedAt == null);

        var totalCount = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .CountAsync(query, cancellationToken);

        var items = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .ToListAsync(
                query.OrderBy(i => i.InvoiceDate)
                     .Skip((request.Page - 1) * request.PageSize)
                     .Take(request.PageSize),
                cancellationToken);

        var dtos = items.Select(i => new ReturnInvoiceDto(
            i.Id,
            i.InvoiceType,
            i.InvoiceNumber,
            i.InvoiceDate,
            i.SupplierGstin,
            i.SupplierName,
            i.BuyerGstin,
            i.TaxableValue,
            i.IgstAmount,
            i.CgstAmount,
            i.SgstAmount,
            i.CessAmount,
            i.TotalInvoiceValue,
            i.IrnStatus)).ToList();

        return new ListReturnInvoicesResponse(dtos, totalCount, request.Page, request.PageSize);
    }
}
