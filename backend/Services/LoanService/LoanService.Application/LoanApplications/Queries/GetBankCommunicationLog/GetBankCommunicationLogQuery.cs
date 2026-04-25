using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetBankCommunicationLog;

/// <summary>Returns the full status transition log for a loan application (bank communication audit trail).</summary>
public record GetBankCommunicationLogQuery(Guid ApplicationId) : IQuery<BankCommunicationLogDto>;

/// <summary>Full log of status transitions for a loan application.</summary>
public record BankCommunicationLogDto(
    Guid ApplicationId,
    IReadOnlyList<StatusLogEntryDto> Entries);

/// <summary>Single status log entry.</summary>
public record StatusLogEntryDto(
    Guid EntryId,
    string FromStatus,
    string ToStatus,
    DateTime TransitionedAt,
    string TransitionSource,
    string? Notes);

/// <summary>Handler: returns status log with IDOR org-scoping.</summary>
public sealed class GetBankCommunicationLogQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetBankCommunicationLogQuery, BankCommunicationLogDto>
{
    /// <inheritdoc />
    public async Task<Result<BankCommunicationLogDto>> Handle(
        GetBankCommunicationLogQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: verify application belongs to caller's org
        var applicationExists = await db.LoanApplications
            .AnyAsync(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null,
                cancellationToken);

        if (!applicationExists)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var entries = await db.ApplicationStatusLogs
            .Where(l => l.ApplicationId == request.ApplicationId)
            .OrderBy(l => l.TransitionedAt)
            .Select(l => new StatusLogEntryDto(
                l.Id,
                l.FromStatus,
                l.ToStatus,
                l.TransitionedAt,
                l.TransitionSource,
                l.Notes))
            .ToListAsync(cancellationToken);

        return new BankCommunicationLogDto(request.ApplicationId, entries);
    }
}
