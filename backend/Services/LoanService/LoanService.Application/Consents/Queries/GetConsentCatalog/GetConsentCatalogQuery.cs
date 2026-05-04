using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.Consents.Queries.GetConsentCatalog;

/// <summary>
/// P6-HANDOFF-25 / SEC-050: returns the current (non-retired) consent catalog
/// so the mobile/admin client can echo the exact text version in RecordConsent
/// for DPDP audit. Read-only, locale-filtered.
/// </summary>
public record GetConsentCatalogQuery(string? Locale = null)
    : IQuery<ConsentCatalogResponse>;

public record ConsentCatalogItem(
    string ConsentType,
    string TextVersion,
    string Locale,
    string BodyMd,
    DateTime EffectiveFrom);

public record ConsentCatalogResponse(IReadOnlyList<ConsentCatalogItem> Items);

public sealed class GetConsentCatalogQueryHandler(ILoanServiceDbContext db)
    : IQueryHandler<GetConsentCatalogQuery, ConsentCatalogResponse>
{
    public async Task<Result<ConsentCatalogResponse>> Handle(
        GetConsentCatalogQuery request, CancellationToken ct)
    {
        var locale = string.IsNullOrWhiteSpace(request.Locale) ? "en" : request.Locale.Trim().ToLowerInvariant();

        var items = await db.ConsentCatalog
            .Where(c => c.RetiredAt == null && c.Locale == locale && c.DeletedAt == null)
            .OrderBy(c => c.ConsentType)
            .Select(c => new ConsentCatalogItem(
                c.ConsentType, c.TextVersion, c.Locale, c.BodyMd, c.EffectiveFrom))
            .ToListAsync(ct);

        return Result<ConsentCatalogResponse>.Success(new ConsentCatalogResponse(items));
    }
}
