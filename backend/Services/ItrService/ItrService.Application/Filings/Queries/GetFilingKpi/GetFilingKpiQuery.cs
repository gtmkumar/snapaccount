using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.GetFilingKpi;

/// <summary>
/// Returns ITR verification KPI counts for the admin ITR page.
/// Org-scoped: only assessees/filings belonging to the caller's org are counted.
/// Response shape matches the <c>ItrVerificationKpiSchema</c> Zod schema in <c>src/admin/src/lib/itrApi.ts</c>:
///   { awaitingReview, slaBreached, avgTimeToReviewDays, totalFilingsAy }
///
/// SLA: 3 business days from submission to CA approval.
/// A filing is "SLA breached" when it has been in UNDER_CA_REVIEW for more than 72 hours
/// and has not yet been approved/rejected.
/// </summary>
[RequiresPermission("admin.itr.read")]
public record GetFilingKpiQuery(string? AssessmentYear = null) : IQuery<FilingKpiResponse>;

/// <summary>
/// Filing KPI response — field names match the frontend <c>ItrVerificationKpiSchema</c> exactly.
/// </summary>
public record FilingKpiResponse(
    int AwaitingReview,
    int SlaBreached,
    double AvgTimeToReviewDays,
    int TotalFilingsAy);

/// <summary>Handles <see cref="GetFilingKpiQuery"/>.</summary>
public sealed class GetFilingKpiQueryHandler(IItrDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetFilingKpiQuery, FilingKpiResponse>
{
    /// <summary>SLA: filings in UNDER_CA_REVIEW for more than this threshold are considered breached.</summary>
    private static readonly TimeSpan SlaThreshold = TimeSpan.FromHours(72);

    /// <inheritdoc />
    public async Task<Result<FilingKpiResponse>> Handle(GetFilingKpiQuery request, CancellationToken ct)
    {
        var orgId = currentUser.OrganizationId;
        if (orgId is null || orgId == Guid.Empty)
            return Result<FilingKpiResponse>.Failure(
                Error.Validation("ITR.MissingOrg",
                    "Organization context missing from session. Complete business onboarding and call POST /auth/token/refresh-context first."));

        // Scope assessees to caller's org.
        var orgAssesseeIds = db.Assessees
            .Where(a => a.OrganizationId == orgId && a.DeletedAt == null)
            .Select(a => a.Id);

        var baseQuery = db.Filings
            .Where(f => orgAssesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null);

        // Apply optional assessment year filter (used by admin ITR page).
        if (request.AssessmentYear is not null)
            baseQuery = baseQuery.Where(f => f.AssessmentYear == request.AssessmentYear);

        // Total filings for the given AY (or all if no AY filter).
        var totalFilingsAy = await baseQuery.CountAsync(ct);

        // Filings currently awaiting CA review.
        var awaitingReview = await baseQuery
            .CountAsync(f => f.Status == "UNDER_CA_REVIEW", ct);

        // SLA breach threshold timestamp.
        var slaBreachCutoff = DateTime.UtcNow.Subtract(SlaThreshold);

        // Filings in UNDER_CA_REVIEW that have been there for longer than the SLA threshold.
        var slaBreached = await baseQuery
            .CountAsync(
                f => f.Status == "UNDER_CA_REVIEW" && f.UpdatedAt < slaBreachCutoff,
                ct);

        // Average time from submission (UpdatedAt when entering UNDER_CA_REVIEW proxy: UpdatedAt on submit)
        // to current time for filings still under review, or to approvedAt/rejectedAt for resolved ones.
        // Simplified: compute avg review-pending age for all UNDER_CA_REVIEW filings.
        // For resolved filings use (UpdatedAt - CreatedAt) as proxy for time-to-review.
        double avgTimeToReviewDays = 0;
        var reviewedFilings = await baseQuery
            .Where(f => f.Status != "DRAFT" && f.Status != "UNDER_CA_REVIEW")
            .Select(f => new { f.CreatedAt, f.UpdatedAt })
            .ToListAsync(ct);

        if (reviewedFilings.Count > 0)
        {
            avgTimeToReviewDays = reviewedFilings
                .Average(f => (f.UpdatedAt - f.CreatedAt).TotalDays);
            avgTimeToReviewDays = Math.Round(avgTimeToReviewDays, 1);
        }

        return new FilingKpiResponse(
            AwaitingReview: awaitingReview,
            SlaBreached: slaBreached,
            AvgTimeToReviewDays: avgTimeToReviewDays,
            TotalFilingsAy: totalFilingsAy);
    }
}
