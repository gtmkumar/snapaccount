using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Dashboard.Queries.GetNoticesDueSummary;

/// <summary>
/// Cross-organisation GST-notice "due" buckets for the admin dashboard NoticesDueWidget.
///
/// "Open" = a notice still awaiting a response: Status NOT IN (RESPONDED, CLOSED).
/// Buckets count open notices that carry a <see cref="Domain.Entities.GstNotice.DueDate"/>,
/// relative to today (UTC):
///   overdue     — DueDate &lt; today
///   dueIn2Days  — today &lt;= DueDate &lt;= today + 2 days
///   dueThisWeek — today &lt;= DueDate &lt;= today + 7 days  (superset of dueIn2Days)
///   total       — all open notices (regardless of DueDate)
/// SUPER_ADMIN only — no org scoping (platform-wide admin dashboard).
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetNoticesDueSummaryQuery : IQuery<NoticesDueSummaryDto>;

public record NoticesDueSummaryDto(int Overdue, int DueIn2Days, int DueThisWeek, int Total);

public sealed class GetNoticesDueSummaryQueryHandler(IGstDbContext db)
    : IQueryHandler<GetNoticesDueSummaryQuery, NoticesDueSummaryDto>
{
    // A notice is no longer "due" once it has been responded to or closed.
    // (Status filter is inlined in the handler for reliable EF SQL translation.)
    public async Task<Result<NoticesDueSummaryDto>> Handle(GetNoticesDueSummaryQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var in2Days = today.AddDays(2);
        var inWeek = today.AddDays(7);

        // Open = not yet responded or closed. Avoid Contains() on a static array — some
        // EF Core + Npgsql builds fail to translate it inside aggregate projections.
        var open = db.GstNotices.Where(n =>
            n.DeletedAt == null &&
            n.Status != "RESPONDED" &&
            n.Status != "CLOSED");

        var overdue = await open.CountAsync(n => n.DueDate != null && n.DueDate < today, ct);
        var dueIn2Days = await open.CountAsync(
            n => n.DueDate != null && n.DueDate >= today && n.DueDate <= in2Days, ct);
        var dueThisWeek = await open.CountAsync(
            n => n.DueDate != null && n.DueDate >= today && n.DueDate <= inWeek, ct);
        var total = await open.CountAsync(ct);

        return new NoticesDueSummaryDto(overdue, dueIn2Days, dueThisWeek, total);
    }
}
