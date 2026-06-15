using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Admin.Queries.GetAdminDocumentQueue;

/// <summary>
/// GAP-013: Returns a paginated admin document queue sorted by SLA urgency.
/// Each row includes server-computed SLA fields: deadline, hours remaining, and overdue flag.
/// Replaces the client-side SlaChip calculation so admin and reports agree.
/// </summary>
[RequiresPermission("document.admin")]
public record GetAdminDocumentQueueQuery(
    int Page = 1,
    int PageSize = 20,
    string? Status = null,
    Guid? CategoryId = null,
    bool? OverdueOnly = null,
    string? SortBy = null // "sla_asc" | "uploaded_desc" (default)
) : IQuery<PaginatedResult<AdminDocumentQueueItemDto>>;

/// <summary>Document queue item with server-side SLA fields.</summary>
public record AdminDocumentQueueItemDto(
    Guid Id,
    string FileName,
    string Status,
    string? CategoryCode,
    string? CategoryName,
    string? VendorName,
    decimal? Amount,
    DateOnly? DocumentDate,
    DateTime UploadedAt,
    /// <summary>Deadline computed as UploadedAt + category.SlaHours. Null if category has no SLA.</summary>
    DateTime? SlaDeadline,
    /// <summary>Hours remaining until SLA breach. Negative = already overdue. Null if no SLA.</summary>
    double? SlaHoursRemaining,
    /// <summary>True when past SLA deadline and document is still pending review (not yet APPROVED/REJECTED/ARCHIVED).</summary>
    bool IsOverdue,
    Guid? OrganizationId);

/// <summary>Handles <see cref="GetAdminDocumentQueueQuery"/>.</summary>
public sealed class GetAdminDocumentQueueQueryHandler(IDocumentDbContext db)
    : IQueryHandler<GetAdminDocumentQueueQuery, PaginatedResult<AdminDocumentQueueItemDto>>
{
    private static readonly HashSet<string> PendingStatuses =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "UPLOADED", "OCR_IN_PROGRESS", "OCR_COMPLETE", "IN_REVIEW"
        };

    /// <inheritdoc />
    public async Task<Result<PaginatedResult<AdminDocumentQueueItemDto>>> Handle(
        GetAdminDocumentQueueQuery request,
        CancellationToken cancellationToken)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var now = DateTime.UtcNow;

        // Join documents with their categories (left join — category may be null)
        var query =
            from doc in db.Documents
            where doc.DeletedAt == null
            join cat in db.DocumentCategories.Where(c => c.DeletedAt == null)
                on doc.CategoryId equals cat.Id into catJoin
            from category in catJoin.DefaultIfEmpty()
            select new
            {
                doc.Id,
                doc.FileName,
                doc.Status,
                doc.VendorName,
                doc.Amount,
                doc.DocumentDate,
                doc.UploadedAt,
                doc.OrganizationId,
                CategoryCode = category != null ? category.Code : null,
                CategoryName = category != null ? category.Name : null,
                SlaHours = category != null ? category.SlaHours : null
            };

        if (!string.IsNullOrWhiteSpace(request.Status))
            query = query.Where(x => x.Status == request.Status);

        if (request.CategoryId.HasValue)
            query = query.Where(x => x.CategoryCode != null);

        var total = await query.CountAsync(cancellationToken);

        // Pull into memory for SLA computation (EF cannot compute DateTime arithmetic in Postgres)
        var rawItems = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = rawItems
            .Select(x =>
            {
                DateTime? slaDeadline = x.SlaHours.HasValue
                    ? x.UploadedAt.AddHours(x.SlaHours.Value)
                    : null;
                double? slaHoursRemaining = slaDeadline.HasValue
                    ? (slaDeadline.Value - now).TotalHours
                    : null;
                bool isOverdue = slaDeadline.HasValue
                    && now > slaDeadline.Value
                    && PendingStatuses.Contains(x.Status);

                return new AdminDocumentQueueItemDto(
                    Id: x.Id,
                    FileName: x.FileName,
                    Status: x.Status,
                    CategoryCode: x.CategoryCode,
                    CategoryName: x.CategoryName,
                    VendorName: x.VendorName,
                    Amount: x.Amount,
                    DocumentDate: x.DocumentDate,
                    UploadedAt: x.UploadedAt,
                    SlaDeadline: slaDeadline,
                    SlaHoursRemaining: slaHoursRemaining.HasValue
                        ? Math.Round(slaHoursRemaining.Value, 2)
                        : null,
                    IsOverdue: isOverdue,
                    OrganizationId: x.OrganizationId);
            })
            .ToList();

        // Apply OverdueOnly filter post-SLA computation
        if (request.OverdueOnly == true)
            items = items.Where(i => i.IsOverdue).ToList();

        // Sort: overdue first (sla_asc), or uploaded_desc (default)
        items = (request.SortBy?.ToLowerInvariant()) switch
        {
            "sla_asc" => items
                .OrderBy(i => i.IsOverdue ? 0 : 1)
                .ThenBy(i => i.SlaHoursRemaining ?? double.MaxValue)
                .ToList(),
            _ => items.OrderByDescending(i => i.UploadedAt).ToList()
        };

        return Result<PaginatedResult<AdminDocumentQueueItemDto>>.Success(
            PaginatedResult<AdminDocumentQueueItemDto>.Create(items, total, page, pageSize));
    }
}
