using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Queries.GetFilingQueue;

/// <summary>
/// Returns the admin CA filing queue — GST returns ordered by SLA expiry (nulls last).
/// Rate: standard (100 req/min). Permission: admin.gst.queue.read.
/// Expected latency: &lt;100 ms for Limit≤50 with partial index ix_gst_return_queue.
/// </summary>
[RequiresPermission("admin.gst.queue.read")]
public record GetFilingQueueQuery(
    string? Status = null,
    int Limit = 50) : IQuery<List<FilingQueueItemDto>>;

/// <summary>Single row in the filing queue.</summary>
public record FilingQueueItemDto(
    Guid Id,
    Guid OrgId,
    string? BusinessName,
    string ReturnType,
    string Status,
    DateOnly? FilingDeadline,
    DateTime? SlaExpiresAt,
    Guid? AssignedCaUserId);

/// <summary>Handles <see cref="GetFilingQueueQuery"/>.</summary>
public sealed class GetFilingQueueQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<GetFilingQueueQuery, List<FilingQueueItemDto>>
{
    /// <inheritdoc />
    public async Task<Result<List<FilingQueueItemDto>>> Handle(
        GetFilingQueueQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.GstReturns
            .Where(r => r.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(r => r.Status == request.Status);

        // Order by SLA asc; rows without an SLA sink to the bottom via NULLS LAST.
        var items = await query
            .OrderBy(r => r.SlaExpiresAt == null ? 1 : 0)
            .ThenBy(r => r.SlaExpiresAt)
            .Take(request.Limit)
            .Select(r => new FilingQueueItemDto(
                r.Id,
                r.OrganizationId,
                r.BusinessNameSnapshot,
                r.ReturnType,
                r.Status,
                r.FilingDeadline,
                r.SlaExpiresAt,
                r.AssignedCaUserId))
            .ToListAsync(cancellationToken);

        return items;
    }
}
