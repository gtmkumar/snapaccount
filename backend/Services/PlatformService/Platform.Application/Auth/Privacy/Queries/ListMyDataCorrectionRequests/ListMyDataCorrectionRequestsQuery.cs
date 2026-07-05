using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Queries.ListMyDataCorrectionRequests;

/// <summary>
/// Returns all data-correction requests submitted by the authenticated user,
/// newest first.  Resolved requests (completed/rejected) are included.
/// </summary>
public record ListMyDataCorrectionRequestsQuery : IQuery<ListMyDataCorrectionRequestsResult>;

/// <summary>Summary of a single correction request (no internal reviewer notes).</summary>
public sealed record DataCorrectionRequestSummary(
    Guid RequestId,
    string DataCategory,
    string Description,
    string Status,
    DateTime CreatedAt,
    DateTime? ResolvedAt);

/// <summary>Paginated list of correction requests.</summary>
public sealed record ListMyDataCorrectionRequestsResult(
    IReadOnlyList<DataCorrectionRequestSummary> Requests);

/// <summary>Returns all correction requests for the calling user.</summary>
public sealed class ListMyDataCorrectionRequestsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<ListMyDataCorrectionRequestsQuery, ListMyDataCorrectionRequestsResult>
{
    /// <inheritdoc />
    public async Task<Result<ListMyDataCorrectionRequestsResult>> Handle(
        ListMyDataCorrectionRequestsQuery request,
        CancellationToken cancellationToken)
    {
        var requests = await db.DataCorrectionRequests
            .Where(r => r.UserId == currentUser.UserId && r.DeletedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new DataCorrectionRequestSummary(
                r.Id,
                r.DataCategory,
                r.Description,
                r.Status,
                r.CreatedAt,
                r.ResolvedAt))
            .ToListAsync(cancellationToken);

        return Result<ListMyDataCorrectionRequestsResult>.Success(
            new ListMyDataCorrectionRequestsResult(requests));
    }
}
