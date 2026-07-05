using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Queries.GetGstReturnAudit;

/// <summary>
/// DG-GST-02: Returns the paginated audit trail for a given GST return.
/// Mapped to GET /gst/returns/{id}/audit?page=1&amp;pageSize=20.
/// Response shape matches the frontend <c>AuditListSchema</c>:
/// <c>{ items: AuditEvent[], totalCount: number, page: number }</c>.
/// </summary>
[RequiresPermission("gst.returns.read")]
public record GetGstReturnAuditQuery(Guid GstReturnId, int Page = 1, int PageSize = 20)
    : IQuery<GstReturnAuditListDto>;

/// <summary>Paginated list of audit events.</summary>
public record GstReturnAuditListDto(
    IReadOnlyList<GstReturnAuditEventDto> Items,
    int TotalCount,
    int Page);

/// <summary>
/// Single audit event — matches <c>AuditEventSchema</c> in gstApi.ts.
/// Field names use camelCase serialisation (JsonDefaults.Web) matching the frontend Zod schema.
/// </summary>
public record GstReturnAuditEventDto(
    string Id,
    string EventType,
    string ActorEmail,
    string? ActorDisplayName,
    string Timestamp,
    string? Detail,
    string? PreviousStatus,
    string? ArnReceived,
    bool DiffAvailable);

/// <summary>Handles <see cref="GetGstReturnAuditQuery"/>.</summary>
public sealed class GetGstReturnAuditQueryHandler(
    IGstDbContext dbContext,
    ICurrentUser currentUser)
    : IQueryHandler<GetGstReturnAuditQuery, GstReturnAuditListDto>
{
    /// <inheritdoc />
    public async Task<Result<GstReturnAuditListDto>> Handle(
        GetGstReturnAuditQuery request,
        CancellationToken cancellationToken)
    {
        // Org-scoping IDOR guard: ensure the return belongs to the caller's org
        var returnExists = await dbContext.GstReturns.AnyAsync(
            r => r.Id == request.GstReturnId
                 && (!currentUser.OrganizationId.HasValue || r.OrganizationId == currentUser.OrganizationId.Value)
                 && r.DeletedAt == null,
            cancellationToken);

        if (!returnExists)
            return Result<GstReturnAuditListDto>.Failure(
                Error.NotFound("GstReturn", request.GstReturnId));

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var totalCount = await dbContext.GstReturnAudits
            .CountAsync(a => a.GstReturnId == request.GstReturnId, cancellationToken);

        var items = await dbContext.GstReturnAudits
            .Where(a => a.GstReturnId == request.GstReturnId)
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new GstReturnAuditEventDto(
                Id: a.Id.ToString(),
                EventType: a.EventType,
                ActorEmail: a.ActorEmail,
                ActorDisplayName: a.ActorDisplayName,
                Timestamp: a.Timestamp.ToString("O"),
                Detail: a.Detail,
                PreviousStatus: a.PreviousStatus,
                ArnReceived: a.ArnReceived,
                DiffAvailable: false))
            .ToListAsync(cancellationToken);

        return new GstReturnAuditListDto(items, totalCount, page);
    }
}
