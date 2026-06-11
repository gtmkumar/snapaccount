using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.KeyFacts.Queries.GetKfs;

/// <summary>
/// Retrieves the most-recent (or a specific) Key Facts Statement for a loan application.
/// Used for audit retrieval and for serving the KFS to the borrower before consent.
///
/// NEW-D10: When <paramref name="Locale"/> is supplied the query first looks for a KFS row with
/// that locale. If none exists it falls back to the most-recent row regardless of locale
/// (typically "en"). This ensures GET /kfs never fails solely because of a locale mismatch
/// — RBI KFS retrieval is statutory and must not error on locale.
/// </summary>
/// <param name="ApplicationId">The loan application for which to retrieve the KFS.</param>
/// <param name="KfsId">Optional. If supplied, returns that specific KFS (locale ignored).</param>
/// <param name="Locale">Optional BCP-47 locale tag to prefer (e.g. "hi", "bn"). Falls back to "en" version.</param>
[RequiresPermission("loan.kfs.read")]
public record GetKfsQuery(Guid ApplicationId, Guid? KfsId = null, string? Locale = null) : IQuery<KfsDto>;

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
    DateTime? AcknowledgedAt,
    string Locale = "en");

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

        var baseQuery = db.KeyFactsStatements
            .Where(k => k.ApplicationId == request.ApplicationId && k.DeletedAt == null);

        // When a specific KFS id is requested, return that row directly (locale ignored).
        if (request.KfsId.HasValue)
            baseQuery = baseQuery.Where(k => k.Id == request.KfsId.Value);

        // NEW-D10: locale-aware retrieval.
        // When a locale hint is given and no specific KfsId is requested, prefer the locale
        // variant. If none exists, fall back to the most-recent row regardless of locale.
        // "Never fail a KFS fetch because of locale" — RBI statutory requirement.
        KfsDto? kfs = null;

        if (!request.KfsId.HasValue && !string.IsNullOrWhiteSpace(request.Locale))
        {
            var preferredLocale = request.Locale.Trim().ToLowerInvariant();
            kfs = await baseQuery
                .Where(k => k.Locale == preferredLocale)
                .OrderByDescending(k => k.GeneratedAt)
                .Select(k => new KfsDto(
                    k.Id, k.ApplicationId,
                    k.AnnualPercentageRate, k.LoanAmount, k.TenureMonths, k.MonthlyEmi,
                    k.FeesJson, k.RepaymentScheduleJson,
                    k.LenderName, k.GrievanceOfficerContact, k.CoolingOffDays,
                    k.HmacSignature, k.GeneratedAt, k.AcknowledgedAt, k.Locale))
                .FirstOrDefaultAsync(cancellationToken);
        }

        // Fallback: most-recent KFS row (any locale).
        kfs ??= await baseQuery
            .OrderByDescending(k => k.GeneratedAt)
            .Select(k => new KfsDto(
                k.Id, k.ApplicationId,
                k.AnnualPercentageRate, k.LoanAmount, k.TenureMonths, k.MonthlyEmi,
                k.FeesJson, k.RepaymentScheduleJson,
                k.LenderName, k.GrievanceOfficerContact, k.CoolingOffDays,
                k.HmacSignature, k.GeneratedAt, k.AcknowledgedAt, k.Locale))
            .FirstOrDefaultAsync(cancellationToken);

        if (kfs is null)
            return Result<KfsDto>.Failure(
                Error.NotFound("KeyFactsStatement", request.ApplicationId));

        return Result<KfsDto>.Success(kfs);
    }
}
