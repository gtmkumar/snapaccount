using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Dashboard.Queries.GetDashboardStats;

/// <summary>
/// Admin dashboard counts for DocumentService — pending docs across all orgs.
///
/// "Pending" = documents that are actively in the processing pipeline and require attention:
///   UPLOADED | OCR_IN_PROGRESS | OCR_COMPLETE | IN_REVIEW
///
/// "Terminal" (excluded from pending count) = documents where processing is complete:
///   PROCESSED | REJECTED | ARCHIVED | APPROVED
///
/// WEB-FIX: APPROVED was previously missing from TerminalStatuses, causing the dashboard to
/// report 4 "pending" documents that the queue page (which filters by UPLOADED/IN_REVIEW)
/// could not display. Root cause: APPROVED is a completed/terminal state — the document
/// has been reviewed and the accounting pipeline event has already been emitted. Adding APPROVED
/// to TerminalStatuses aligns the dashboard count with the queue page view.
///
/// Org-scoped to the caller's organisation, matching the org-scoped Documents queue.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetDashboardStatsQuery : IQuery<DocumentDashboardStats>;

public record DocumentDashboardStats(int PendingDocuments);

public sealed class GetDashboardStatsQueryHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDashboardStatsQuery, DocumentDashboardStats>
{
    /// <summary>
    /// Statuses that indicate a document is fully processed — excluded from the "pending" dashboard count.
    /// APPROVED is terminal: the review is done and the accounting event has been emitted.
    /// </summary>
    private static readonly string[] TerminalStatuses =
        ["PROCESSED", "REJECTED", "ARCHIVED", "APPROVED"];

    public async Task<Result<DocumentDashboardStats>> Handle(GetDashboardStatsQuery request, CancellationToken ct)
    {
        var query = db.Documents
            .Where(d => d.DeletedAt == null && !TerminalStatuses.Contains(d.Status));

        // Scope to the caller's org so this matches the org-scoped Documents queue (GetDocumentsQuery
        // filters d.OrganizationId == currentUser.OrganizationId). Without this the count was cross-org
        // and included orphaned org_id=Guid.Empty rows — dashboard showed 4 pending while the queue showed 0.
        var orgId = currentUser.OrganizationId;
        if (orgId is not null && orgId != Guid.Empty)
            query = query.Where(d => d.OrganizationId == orgId.Value);

        var pending = await query.CountAsync(ct);

        return new DocumentDashboardStats(pending);
    }
}
