using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Queries.ListImsInvoices;

/// <summary>
/// Returns a paginated list of IMS inward invoices for an organisation,
/// with optional filters on period, status, supplier GSTIN, and free-text search.
/// </summary>
[RequiresPermission("gst.ims.read")]
public record ListImsInvoicesQuery(
    Guid OrganizationId,
    string? Period = null,
    string? Status = null,
    string? SupplierGstin = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListImsInvoicesDto>;

/// <summary>Paginated result DTO.</summary>
public record ListImsInvoicesDto(
    IReadOnlyList<ImsInvoiceSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Summary projection for the IMS inbox list view.</summary>
public record ImsInvoiceSummary(
    Guid Id,
    string SupplierGstin,
    string SupplierName,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    decimal InvoiceValue,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    string Period,
    string Source,
    string Status,
    bool DeemedAccepted,
    DateTime? ActionedAt,
    Guid? ActionedBy);

/// <summary>Validator for <see cref="ListImsInvoicesQuery"/>.</summary>
public sealed class ListImsInvoicesQueryValidator : AbstractValidator<ListImsInvoicesQuery>
{
    private static readonly HashSet<string> ValidStatuses =
        ["PENDING", "ACCEPTED", "REJECTED", "PENDING_KEPT"];

    public ListImsInvoicesQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Period)
            .Matches(@"^\d{2}\d{4}$")
            .WithMessage("Period must be in MMYYYY format.")
            .When(x => x.Period is not null);
        RuleFor(x => x.Status)
            .Must(s => ValidStatuses.Contains(s!))
            .WithMessage("Status must be one of: PENDING, ACCEPTED, REJECTED, PENDING_KEPT.")
            .When(x => x.Status is not null);
        RuleFor(x => x.Search)
            .MaximumLength(100)
            .When(x => x.Search is not null);
    }
}

/// <summary>Handler for <see cref="ListImsInvoicesQuery"/>.</summary>
public sealed class ListImsInvoicesQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListImsInvoicesQuery, ListImsInvoicesDto>
{
    /// <inheritdoc />
    public async Task<Result<ListImsInvoicesDto>> Handle(
        ListImsInvoicesQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.ImsInvoices
            .Where(i => i.OrganizationId == request.OrganizationId && i.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.Period))
            query = query.Where(i => i.Period == request.Period);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(i => i.Status == request.Status);

        if (!string.IsNullOrEmpty(request.SupplierGstin))
            query = query.Where(i => i.SupplierGstin == request.SupplierGstin);

        if (!string.IsNullOrEmpty(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(i =>
                i.InvoiceNumber.ToLower().Contains(search) ||
                i.SupplierName.ToLower().Contains(search) ||
                i.SupplierGstin.ToLower().Contains(search));
        }

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(i => new ImsInvoiceSummary(
                i.Id, i.SupplierGstin, i.SupplierName, i.InvoiceNumber, i.InvoiceDate,
                i.InvoiceValue, i.TaxableValue, i.IgstAmount, i.CgstAmount, i.SgstAmount, i.CessAmount,
                i.Period, i.Source, i.Status, i.DeemedAccepted, i.ActionedAt, i.ActionedBy))
            .ToListAsync(cancellationToken);

        return new ListImsInvoicesDto(items, total, request.Page, request.PageSize);
    }
}
