using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetApplication;

/// <summary>Gets a single loan application by ID. IDOR-scoped to current user's org.</summary>
public record GetApplicationQuery(Guid ApplicationId) : IQuery<LoanApplicationDto>;

/// <summary>DTO returned by GetApplicationQuery.</summary>
public record LoanApplicationDto(
    Guid ApplicationId,
    Guid OrgId,
    Guid LoanProductId,
    string ProductName,
    decimal RequestedAmount,
    int TenureMonths,
    string? Purpose,
    string Status,
    DateTime? SubmittedAt,
    string? BankReferenceNo,
    DateTime? DisbursedAt,
    decimal? DisbursedAmount,
    Guid? AssignedBankId,
    string? AssignedBankName,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Handler: fetches application with IDOR org-scoping.</summary>
public sealed class GetApplicationQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetApplicationQuery, LoanApplicationDto>
{
    /// <inheritdoc />
    public async Task<Result<LoanApplicationDto>> Handle(
        GetApplicationQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Migration 066: assigned_bank_id column confirmed — project AssignedBankId and AssignedBank.Name.
        var dto = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
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
            .FirstOrDefaultAsync(cancellationToken);

        if (dto == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        return dto;
    }
}
