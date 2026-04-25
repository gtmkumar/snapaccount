using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Queries.ListInvoices;

/// <summary>Lists invoices for the caller's organisation (paginated).</summary>
public record ListInvoicesQuery(int Page = 1, int PageSize = 20) : IQuery<InvoicePageDto>;

/// <summary>Paginated invoice list.</summary>
public record InvoicePageDto(
    IReadOnlyList<InvoiceDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Invoice summary DTO.</summary>
public record InvoiceDto(
    Guid InvoiceId,
    Guid SubscriptionId,
    string InvoiceNumber,
    decimal AmountInr,
    decimal GstAmountInr,
    decimal TotalInr,
    string Status,
    DateTime PeriodStart,
    DateTime PeriodEnd,
    DateTime? PaidAt,
    string? PdfGcsUri);

/// <summary>Handler: lists invoices with IDOR org-scoping.</summary>
public sealed class ListInvoicesQueryHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListInvoicesQuery, InvoicePageDto>
{
    /// <inheritdoc />
    public async Task<Result<InvoicePageDto>> Handle(
        ListInvoicesQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var query = db.Invoices
            .Where(i => i.OrganizationId == orgId && i.DeletedAt == null);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new InvoiceDto(
                i.Id,
                i.SubscriptionId,
                i.InvoiceNumber,
                i.AmountInr,
                i.GstAmountInr,
                i.AmountInr + i.GstAmountInr,
                i.Status,
                i.PeriodStart,
                i.PeriodEnd,
                i.PaidAt,
                i.PdfGcsUri))
            .ToListAsync(cancellationToken);

        return new InvoicePageDto(items, total, page, pageSize);
    }
}
