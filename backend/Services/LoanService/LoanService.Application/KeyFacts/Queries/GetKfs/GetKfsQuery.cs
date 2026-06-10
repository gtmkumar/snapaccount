using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.KeyFacts.Queries.GetKfs;

/// <summary>
/// Retrieves the most-recent (or a specific) Key Facts Statement for a loan application.
/// Used for audit retrieval and for serving the KFS to the borrower before consent.
/// </summary>
/// <param name="ApplicationId">The loan application for which to retrieve the KFS.</param>
/// <param name="KfsId">Optional. If supplied, returns that specific KFS.</param>
[RequiresPermission("loan.kfs.read")]
public record GetKfsQuery(Guid ApplicationId, Guid? KfsId = null) : IQuery<KfsDto>;

/// <summary>KFS data returned to callers.</summary>
public sealed record KfsDto(
    Guid KfsId,
    Guid ApplicationId,
    decimal AnnualPercentageRate,
    decimal LoanAmount,
    int TenureMonths,
    decimal MonthlyEmi,
    string FeesJson,
    string RepaymentScheduleJson,
    string LenderName,
    string GrievanceOfficerContact,
    int CoolingOffDays,
    string HmacSignature,
    DateTime GeneratedAt,
    DateTime? AcknowledgedAt);

/// <summary>Reads the KFS for audit or borrower display.</summary>
public sealed class GetKfsQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetKfsQuery, KfsDto>
{
    /// <inheritdoc />
    public async Task<Result<KfsDto>> Handle(
        GetKfsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Verify the application belongs to the caller's org (IDOR guard).
        var appExists = await db.LoanApplications
            .AnyAsync(a => a.Id == request.ApplicationId
                           && a.OrgId == orgId
                           && a.DeletedAt == null, cancellationToken);

        if (!appExists)
            return Result<KfsDto>.Failure(
                Error.NotFound("LoanApplication", request.ApplicationId));

        var query = db.KeyFactsStatements
            .Where(k => k.ApplicationId == request.ApplicationId && k.DeletedAt == null);

        if (request.KfsId.HasValue)
            query = query.Where(k => k.Id == request.KfsId.Value);

        var kfs = await query
            .OrderByDescending(k => k.GeneratedAt)
            .Select(k => new KfsDto(
                k.Id,
                k.ApplicationId,
                k.AnnualPercentageRate,
                k.LoanAmount,
                k.TenureMonths,
                k.MonthlyEmi,
                k.FeesJson,
                k.RepaymentScheduleJson,
                k.LenderName,
                k.GrievanceOfficerContact,
                k.CoolingOffDays,
                k.HmacSignature,
                k.GeneratedAt,
                k.AcknowledgedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (kfs is null)
            return Result<KfsDto>.Failure(
                Error.NotFound("KeyFactsStatement", request.ApplicationId));

        return Result<KfsDto>.Success(kfs);
    }
}
