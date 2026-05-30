using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Admin.Queries.GetAuditEvents;

/// <summary>
/// Cross-service audit-event tail for the admin dashboard recent-activity widget.
/// Reads directly from the partitioned <c>shared.audit_log</c> table that all
/// services already write to (see migration 012).
///
/// SUPER_ADMIN only. Limited to last N events (max 100) ordered by event_time DESC.
/// PII-bearing rows (is_sensitive = TRUE) are omitted from the projection so this
/// endpoint can't be used as an exfiltration path.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetAuditEventsQuery(int Limit = 20, Guid? ActorUserId = null)
    : IQuery<IReadOnlyList<AuditEventDto>>;

public record AuditEventDto(
    Guid Id,
    DateTime EventTime,
    string Service,
    string EntityType,
    string Action,
    Guid? ActorUserId,
    string ActorType);

public sealed class GetAuditEventsQueryValidator : AbstractValidator<GetAuditEventsQuery>
{
    public GetAuditEventsQueryValidator() => RuleFor(x => x.Limit).InclusiveBetween(1, 100);
}

public sealed class GetAuditEventsQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetAuditEventsQuery, IReadOnlyList<AuditEventDto>>
{
    public async Task<Result<IReadOnlyList<AuditEventDto>>> Handle(GetAuditEventsQuery request, CancellationToken ct)
    {
        var query = db.AuditEvents.Where(a => !a.IsSensitive);

        if (request.ActorUserId.HasValue)
            query = query.Where(a => a.ActorUserId == request.ActorUserId.Value);

        var rows = await query
            .OrderByDescending(a => a.EventTime)
            .Take(request.Limit)
            .Select(a => new AuditEventDto(
                a.Id, a.EventTime, a.Service, a.EntityType, a.Action,
                a.ActorUserId, a.ActorType))
            .ToListAsync(ct);

        return Result<IReadOnlyList<AuditEventDto>>.Success(rows);
    }
}
