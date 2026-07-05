using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Grievances.Queries.ListGrievances;

/// <summary>Lists grievances for a filing the caller's org owns (P6-HANDOFF-23).</summary>
[RequiresPermission("itr.grievance.read")]
public record ListGrievancesQuery(Guid FilingId) : IQuery<IReadOnlyList<GrievanceDto>>;

public record GrievanceDto(
    Guid Id,
    Guid FilingId,
    string Subject,
    string Category,
    string Status,
    DateTime CreatedAt,
    DateTime? ResolvedAt);

public sealed class ListGrievancesQueryHandler(IItrDbContext db, ICurrentUser currentUser)
    : IQueryHandler<ListGrievancesQuery, IReadOnlyList<GrievanceDto>>
{
    public async Task<Result<IReadOnlyList<GrievanceDto>>> Handle(
        ListGrievancesQuery request, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var filing = await db.Filings
            .Where(f => f.Id == request.FilingId && f.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (filing is null)
            return Result<IReadOnlyList<GrievanceDto>>.Success(Array.Empty<GrievanceDto>());

        var assessee = await db.Assessees
            .Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result<IReadOnlyList<GrievanceDto>>.Success(Array.Empty<GrievanceDto>());

        var items = await db.Grievances
            .Where(g => g.FilingId == request.FilingId && g.DeletedAt == null)
            .OrderByDescending(g => g.CreatedAt)
            .Select(g => new GrievanceDto(
                g.Id, g.FilingId, g.Subject, g.Category, g.Status, g.CreatedAt, g.ResolvedAt))
            .ToListAsync(ct);

        return Result<IReadOnlyList<GrievanceDto>>.Success(items);
    }
}
