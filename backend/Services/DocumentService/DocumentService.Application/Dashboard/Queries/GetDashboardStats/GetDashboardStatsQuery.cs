using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for DocumentService — pending docs across all orgs.
/// "Pending" = any status other than PROCESSED / REJECTED / ARCHIVED.
/// SUPER_ADMIN only — no org scoping.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<DocumentDashboardStats>;

public record DocumentDashboardStats(int PendingDocuments);

public sealed class GetDashboardStatsQueryHandler(IDocumentDbContext db)
    : IQueryHandler<GetDashboardStatsQuery, DocumentDashboardStats>
{
    private static readonly string[] TerminalStatuses = ["PROCESSED", "REJECTED", "ARCHIVED"];

    public async Task<Result<DocumentDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var pending = await db.Documents
            .Where(d => d.DeletedAt == null && !TerminalStatuses.Contains(d.Status))
            .CountAsync(ct);

        return new DocumentDashboardStats(pending);
    }
}
