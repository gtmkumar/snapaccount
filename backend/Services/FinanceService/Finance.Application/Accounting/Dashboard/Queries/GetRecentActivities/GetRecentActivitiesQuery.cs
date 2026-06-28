using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Dashboard.Queries.GetRecentActivities;

/// <summary>
/// DG-DASH-01: Mobile Home recent-activities feed.
/// Returns the most recent financial-activity items (documents, GST filings) for the
/// caller's organisation, ordered by timestamp descending.
/// Route: GET /accounting/recent-activities?limit=N
/// </summary>
[RequiresPermission("accounting.reports.read")]
public record GetRecentActivitiesQuery(Guid OrgId, int Limit = 5) : IQuery<IReadOnlyList<ActivityItemDto>>;

/// <summary>
/// Single activity-feed item — matches ActivityItem interface in mobile HomeScreen.tsx.
/// </summary>
/// <param name="Id">Unique stable identifier for this activity row (UUID string).</param>
/// <param name="Type">Activity category: "document" | "gst" | "itr" | "loan".</param>
/// <param name="Description">Human-readable label, e.g. "Invoice uploaded: sales_bill".</param>
/// <param name="Amount">Optional monetary value in INR (null if not applicable).</param>
/// <param name="Timestamp">ISO-8601 UTC timestamp of the event.</param>
public record ActivityItemDto(
    string Id,
    string Type,
    string Description,
    decimal? Amount,
    string Timestamp);

/// <summary>Validates GetRecentActivitiesQuery.</summary>
public sealed class GetRecentActivitiesQueryValidator : AbstractValidator<GetRecentActivitiesQuery>
{
    public GetRecentActivitiesQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.Limit).InclusiveBetween(1, 50).WithMessage("Limit must be between 1 and 50.");
    }
}

/// <summary>
/// Handles <see cref="GetRecentActivitiesQuery"/>.
/// Merges recent document uploads and GST return state changes, sorted by timestamp,
/// taking the most recent <see cref="GetRecentActivitiesQuery.Limit"/> items.
/// </summary>
public sealed class GetRecentActivitiesQueryHandler(
    IDocumentDbContext documentDb,
    IGstDbContext gstDb)
    : IQueryHandler<GetRecentActivitiesQuery, IReadOnlyList<ActivityItemDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<ActivityItemDto>>> Handle(
        GetRecentActivitiesQuery request,
        CancellationToken cancellationToken)
    {
        var limit = Math.Min(request.Limit, 50);

        // ── Recent document uploads for this org ──────────────────────────────
        var docItems = await documentDb.Documents
            .Where(d => d.OrganizationId == request.OrgId
                     && d.DeletedAt == null)
            .OrderByDescending(d => d.UploadedAt)
            .Take(limit)
            .Select(d => new ActivityItemDto(
                d.Id.ToString(),
                "document",
                string.IsNullOrEmpty(d.OriginalFileName)
                    ? "Document uploaded"
                    : $"Document uploaded: {d.OriginalFileName}",
                d.Amount,
                d.UploadedAt.ToString("O")))
            .ToListAsync(cancellationToken);

        // ── Recent GST return state changes for this org ──────────────────────
        var gstItems = await gstDb.GstReturns
            .Where(r => r.OrganizationId == request.OrgId
                     && r.DeletedAt == null)
            .OrderByDescending(r => r.UpdatedAt)
            .Take(limit)
            .Select(r => new ActivityItemDto(
                r.Id.ToString(),
                "gst",
                $"{r.ReturnType} {r.FinancialYear}: {r.Status}",
                r.NetTaxPayable == 0m ? (decimal?)null : r.NetTaxPayable,
                r.UpdatedAt.ToString("O")))
            .ToListAsync(cancellationToken);

        // ── Merge, sort by timestamp descending, take top N ───────────────────
        var merged = docItems
            .Concat(gstItems)
            .OrderByDescending(a => a.Timestamp)
            .Take(limit)
            .ToList();

        return Result<IReadOnlyList<ActivityItemDto>>.Success(merged);
    }
}
