using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Queries.ListGstReturns;

/// <summary>
/// Returns paginated list of GST returns for an organisation.
/// Phase 6A: replaces the 501 stub for GET /gst/returns.
/// </summary>
public record ListGstReturnsQuery(
    Guid OrganizationId,
    string? Status = null,
    string? ReturnType = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListGstReturnsDto>;

/// <summary>Paginated result DTO.</summary>
public record ListGstReturnsDto(
    IReadOnlyList<GstReturnSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Summary projection for list views.</summary>
public record GstReturnSummary(
    Guid Id,
    string ReturnType,
    string FinancialYear,
    int? PeriodMonth,
    string Gstin,
    string Status,
    decimal NetTaxPayable,
    DateOnly? FilingDeadline,
    string? ArnNumber,
    DateTime? FiledAt);

/// <summary>Handles <see cref="ListGstReturnsQuery"/>.</summary>
public sealed class ListGstReturnsQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListGstReturnsQuery, ListGstReturnsDto>
{
    /// <inheritdoc />
    public async Task<Result<ListGstReturnsDto>> Handle(
        ListGstReturnsQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.GstReturns
            .Where(r => r.OrganizationId == request.OrganizationId && r.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(r => r.Status == request.Status);

        if (!string.IsNullOrEmpty(request.ReturnType))
            query = query.Where(r => r.ReturnType == request.ReturnType);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(r => new GstReturnSummary(
                r.Id, r.ReturnType, r.FinancialYear, r.PeriodMonth,
                r.Gstin, r.Status, r.NetTaxPayable, r.FilingDeadline, r.ArnNumber, r.FiledAt))
            .ToListAsync(cancellationToken);

        return new ListGstReturnsDto(items, total, request.Page, request.PageSize);
    }
}
