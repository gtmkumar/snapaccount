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

/// <summary>
/// Per-purpose consent summary returned to the caller.
///
/// Field naming: this DTO deliberately exposes BOTH the original backend field names
/// (Purpose, PurposeDescription, NoticeVersion, ActionAt) and the aligned mobile-contract
/// names (PurposeCode, Description, ConsentTextVersion, GrantedAt).  System.Text.Json
/// serializes C# record properties to camelCase, so clients receive:
///   purpose / purposeCode — same value
///   purposeDescription / description — same value
///   noticeVersion / consentTextVersion — same value
///   actionAt / grantedAt — same value
///
/// This additive approach keeps the admin web client (which reads the old names) and the
/// mobile client (which expects the aligned names) both working without a breaking change.
/// Admin web: src/admin/src/lib/loanApi.ts — does NOT call /auth/me/consents (admin only
/// uses /loans/applications/{id}/consents), so no admin breakage risk.
/// Mobile: mobile/src/api/privacy.ts normalizeConsent() handles both shapes; additive
/// alignment means mobile can drop the normalization shim in a future cleanup pass.
/// </summary>
public sealed record ConsentEntry(
    // ── Original backend names (kept for backwards compat) ───────────────────
    string Purpose,
    string PurposeDescription,
    string Status,
    string NoticeVersion,
    DateTime ActionAt,
    string Locale)
{
    // ── Aligned mobile-contract names (additive — same values, different keys) ─

    /// <summary>Alias of <see cref="Purpose"/> — matches mobile <c>purposeCode</c> field.</summary>
    public string PurposeCode => Purpose;

    /// <summary>Alias of <see cref="PurposeDescription"/> — matches mobile <c>description</c> field.</summary>
    public string Description => PurposeDescription;

    /// <summary>Alias of <see cref="NoticeVersion"/> — matches mobile <c>consentTextVersion</c> field.</summary>
    public string ConsentTextVersion => NoticeVersion;

    /// <summary>Alias of <see cref="ActionAt"/> — matches mobile <c>grantedAt</c> field.</summary>
    public DateTime GrantedAt => ActionAt;
}

/// <summary>
/// Aggregated result for all purposes.
/// The envelope exposes the list as both <c>consents</c> (original) and <c>items</c>
/// (aligned convention used across all other list endpoints).
/// Mobile <c>extractConsentArray</c> in privacy.ts accepts either key.
/// </summary>
public sealed record GetMyConsentsResult(IReadOnlyList<ConsentEntry> Consents)
{
    /// <summary>Alias of <see cref="Consents"/> — matches the platform-wide <c>items</c> convention.</summary>
    public IReadOnlyList<ConsentEntry> Items => Consents;
}

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
        // Fetch the user's (bounded) consent rows, then reduce in memory.
        // EF Core cannot translate GroupBy(..).Select(g => g.OrderByDescending(..).First())
        // to SQL, so the grouping is done client-side. Consent rows per user are
        // few (one per processing purpose), so this is cheap.
        var rows = await db.UserConsents
            .Where(c => c.UserId == currentUser.UserId && c.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var consents = rows
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
            .ToList();

        return Result<GetMyConsentsResult>.Success(new GetMyConsentsResult(consents));
    }
}
