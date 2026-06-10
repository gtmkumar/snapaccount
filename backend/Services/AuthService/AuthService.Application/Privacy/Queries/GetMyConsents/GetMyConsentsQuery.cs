using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Queries.GetMyConsents;

/// <summary>
/// Returns the current consent status for every purpose the authenticated user
/// has ever interacted with.  For each purpose, "current" means the latest row
/// by <c>action_at</c>.
/// </summary>
public record GetMyConsentsQuery : IQuery<GetMyConsentsResult>;

/// <summary>Per-purpose consent summary returned to the caller.</summary>
public sealed record ConsentEntry(
    string Purpose,
    string PurposeDescription,
    string Status,
    string NoticeVersion,
    DateTime ActionAt,
    string Locale);

/// <summary>Aggregated result for all purposes.</summary>
public sealed record GetMyConsentsResult(IReadOnlyList<ConsentEntry> Consents);

/// <summary>Returns the latest consent record per purpose for the calling user.</summary>
public sealed class GetMyConsentsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetMyConsentsQuery, GetMyConsentsResult>
{
    /// <inheritdoc />
    public async Task<Result<GetMyConsentsResult>> Handle(
        GetMyConsentsQuery request,
        CancellationToken cancellationToken)
    {
        // For each purpose, pick the single row with the highest action_at.
        // LINQ: group by purpose, select the row with max action_at.
        var consents = await db.UserConsents
            .Where(c => c.UserId == currentUser.UserId && c.DeletedAt == null)
            .GroupBy(c => c.Purpose)
            .Select(g => g.OrderByDescending(c => c.ActionAt).First())
            .OrderBy(c => c.Purpose)
            .Select(c => new ConsentEntry(
                c.Purpose,
                c.PurposeDescription,
                c.Status,
                c.NoticeVersion,
                c.ActionAt,
                c.Locale))
            .ToListAsync(cancellationToken);

        return Result<GetMyConsentsResult>.Success(new GetMyConsentsResult(consents));
    }
}
