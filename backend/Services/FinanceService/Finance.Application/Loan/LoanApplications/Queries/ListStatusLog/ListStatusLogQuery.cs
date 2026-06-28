using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.ListStatusLog;

/// <summary>
/// Returns the status transition log for a loan application.
/// Admin / DG-LOAN-01: GET /loans/applications/{id}/status-log
/// Matches admin StatusLogListSchema { items: StatusLogEntrySchema[] }.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ListStatusLogQuery(Guid ApplicationId) : IQuery<ListStatusLogResponse>;

/// <summary>Status log list response matching admin StatusLogListSchema.</summary>
public record ListStatusLogResponse(IReadOnlyList<StatusLogEntryDto> Items);

/// <summary>
/// Single status log entry DTO.
/// Matches admin StatusLogEntrySchema:
///   { id, timestamp, fromStatus?, toStatus, actorType, actorName?, note?, payloadDiff? }
/// </summary>
public record StatusLogEntryDto(
    Guid Id,
    DateTime Timestamp,
    string? FromStatus,
    string ToStatus,
    string ActorType,
    string? ActorName,
    string? Note,
    string? PayloadDiff);

/// <summary>Handler: returns status log with IDOR org-scoping.</summary>
public sealed class ListStatusLogQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListStatusLogQuery, ListStatusLogResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListStatusLogResponse>> Handle(
        ListStatusLogQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: verify application belongs to caller's org
        var applicationExists = await db.LoanApplications
            .AnyAsync(
                a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null,
                cancellationToken);

        if (!applicationExists)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var items = await db.ApplicationStatusLogs
            .Where(l => l.ApplicationId == request.ApplicationId)
            .OrderBy(l => l.TransitionedAt)
            .Select(l => new StatusLogEntryDto(
                l.Id,
                l.TransitionedAt,
                string.IsNullOrEmpty(l.FromStatus) ? null : l.FromStatus,
                l.ToStatus,
                MapActorType(l.TransitionSource),
                null,         // ActorName: would require a join to auth.user — omit for now (nullable in schema)
                l.Notes,
                null))        // PayloadDiff: not currently stored
            .ToListAsync(cancellationToken);

        return new ListStatusLogResponse(items);
    }

    /// <summary>Maps TransitionSource values to admin actorType enum values.</summary>
    private static string MapActorType(string transitionSource) => transitionSource switch
    {
        "User" => "officer",
        "System" => "system",
        "Webhook" => "bank",
        _ => "system"
    };
}
