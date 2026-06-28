using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.ListConsents;

/// <summary>
/// Returns all consent records for a loan application.
/// Admin / DG-LOAN-01: GET /loans/applications/{id}/consents
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ListConsentsQuery(Guid ApplicationId) : IQuery<ListConsentsResponse>;

/// <summary>Consent list response matching admin ConsentsListSchema.</summary>
public record ListConsentsResponse(IReadOnlyList<ConsentRecordDto> Items);

/// <summary>Single consent record DTO matching admin ConsentRecordSchema.</summary>
public record ConsentRecordDto(
    Guid ConsentId,
    string ConsentType,
    string ConsentVersion,
    DateTime SignedAt,
    string SignatureHex,
    string? IpAddress,
    string? UserAgent,
    bool? BiometricUsed,
    /// <summary>DG-LOAN-04: UTC timestamp of revocation, null = still active.</summary>
    DateTime? RevokedAt = null,
    /// <summary>DG-LOAN-04: Optional reason given when consent was revoked.</summary>
    string? RevocationReason = null);

/// <summary>Handler: returns consent list with IDOR org-scoping.</summary>
public sealed class ListConsentsQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListConsentsQuery, ListConsentsResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListConsentsResponse>> Handle(
        ListConsentsQuery request,
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

        var items = await db.Consents
            .Where(c => c.ApplicationId == request.ApplicationId)
            .OrderBy(c => c.SignedAt)
            .Select(c => new ConsentRecordDto(
                c.Id,
                c.ConsentType.ToString(),
                c.ConsentTextVersion,
                c.SignedAt,
                Convert.ToHexString(c.SignatureHash).ToLowerInvariant(),
                c.IpAddress,
                c.UserAgent,
                null,             // BiometricUsed: not currently stored; returned as null for Zod nullable compat
                c.RevokedAt,      // DG-LOAN-04: revocation timestamp
                c.RevocationReason)) // DG-LOAN-04: revocation reason
            .ToListAsync(cancellationToken);

        return new ListConsentsResponse(items);
    }
}
