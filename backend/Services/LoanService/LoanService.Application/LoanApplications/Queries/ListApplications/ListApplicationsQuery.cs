using LoanService.Application.Common.Interfaces;
using LoanService.Application.LoanApplications.Queries.GetApplication;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.ListApplications;

/// <summary>Lists loan applications for the current user's org with optional status filter.</summary>
public record ListApplicationsQuery(
    string? StatusFilter,
    int Page = 1,
    int PageSize = 20) : IQuery<ListApplicationsResponse>;

/// <summary>Paginated list of loan applications.</summary>
public record ListApplicationsResponse(
    IReadOnlyList<LoanApplicationDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Handler: lists applications with IDOR org-scoping.</summary>
public sealed class ListApplicationsQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListApplicationsQuery, ListApplicationsResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListApplicationsResponse>> Handle(
        ListApplicationsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        var query = db.LoanApplications
            .Where(a => a.OrgId == orgId && a.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(request.StatusFilter)
            && Enum.TryParse<LoanApplicationStatus>(request.StatusFilter, true, out var statusEnum))
        {
            query = query.Where(a => a.Status == statusEnum);
        }

        var total = await query.CountAsync(cancellationToken);

        // Migration 066: assigned_bank_id column confirmed — project AssignedBankId and AssignedBank.Name.
        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(a => new LoanApplicationDto(
                a.Id,
                a.OrgId,
                a.LoanProductId,
                a.LoanProduct != null ? a.LoanProduct.ProductName : string.Empty,
                a.RequestedAmount,
                a.TenureMonths,
                a.Purpose,
                a.Status.ToString(),
                a.SubmittedAt,
                a.BankReferenceNo,
                a.DisbursedAt,
                a.DisbursedAmount,
                a.AssignedBankId,
                a.AssignedBank != null ? a.AssignedBank.Name : null,
                a.CreatedAt,
                a.UpdatedAt))
            .ToListAsync(cancellationToken);

        return new ListApplicationsResponse(items, total, request.Page, request.PageSize);
    }
}
