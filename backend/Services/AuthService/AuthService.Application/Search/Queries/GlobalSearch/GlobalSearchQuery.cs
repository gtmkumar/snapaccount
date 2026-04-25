using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Search.Queries.GlobalSearch;

/// <summary>
/// Command palette / Cmd+K search aggregator.
/// Queries auth schema for users and organisations.
/// Additional service types (document, return, notice, loan, itr, plan) return
/// empty lists here — cross-service fan-out is deferred to Phase 7 (gRPC service mesh).
/// P95 target: &lt;250ms warm.
/// </summary>
public record GlobalSearchQuery(
    string Q,
    IReadOnlyList<string>? Types = null) : IQuery<GlobalSearchResultDto>;

/// <summary>Search result aggregation.</summary>
public record GlobalSearchResultDto(
    string Query,
    IReadOnlyList<SearchResultItem> Results,
    int TotalCount);

/// <summary>A single search hit from any service.</summary>
public record SearchResultItem(
    string Type,
    string Id,
    string Title,
    string? Subtitle,
    string? Url);

/// <summary>Validates GlobalSearchQuery.</summary>
public sealed class GlobalSearchQueryValidator : AbstractValidator<GlobalSearchQuery>
{
    public GlobalSearchQueryValidator()
    {
        RuleFor(x => x.Q)
            .NotEmpty()
            .MinimumLength(2).WithMessage("Search query must be at least 2 characters.")
            .MaximumLength(200);
    }
}

/// <summary>Handler: searches users + organisations in the auth schema; org-role-aware.</summary>
public sealed class GlobalSearchQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GlobalSearchQuery, GlobalSearchResultDto>
{
    private static readonly IReadOnlyList<string> DefaultTypes =
        ["user", "document", "return", "notice", "callback", "loan", "itr", "plan"];

    /// <inheritdoc />
    public async Task<Result<GlobalSearchResultDto>> Handle(
        GlobalSearchQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        var isAdmin = currentUser.IsInRole("ADMIN") || currentUser.IsInRole("OPS");

        var types = request.Types?.Count > 0 ? request.Types : DefaultTypes;
        var q = request.Q.Trim().ToLowerInvariant();
        var results = new List<SearchResultItem>();

        // ── Users (auth.users) — admin sees all in org; user sees only self ────
        if (types.Contains("user", StringComparer.OrdinalIgnoreCase))
        {
            var userQuery = db.Users.AsQueryable();

            if (!isAdmin)
                userQuery = userQuery.Where(u => u.Id == currentUser.UserId);
            else if (orgId.HasValue)
                userQuery = userQuery.Where(u =>
                    db.OrganizationMembers.Any(m => m.OrganizationId == orgId && m.UserId == u.Id));

            var users = await userQuery
                .Where(u => (u.PhoneNumber != null && u.PhoneNumber.Contains(q))
                         || (u.Email != null && u.Email.Contains(q))
                         || (u.FullName != null && u.FullName.Contains(q)))
                .Take(5)
                .Select(u => new SearchResultItem(
                    "user",
                    u.Id.ToString(),
                    u.FullName ?? u.PhoneNumber ?? u.FirebaseUid ?? u.Id.ToString(),
                    u.PhoneNumber,
                    $"/users/{u.Id}"))
                .ToListAsync(cancellationToken);

            results.AddRange(users);
        }

        // ── Organisations (auth.organizations) — role-aware ───────────────────
        if (types.Contains("user", StringComparer.OrdinalIgnoreCase) && isAdmin)
        {
            var orgs = await db.Organizations
                .Where(o => o.BusinessName.Contains(q) && o.DeletedAt == null)
                .Take(5)
                .Select(o => new SearchResultItem(
                    "organisation",
                    o.Id.ToString(),
                    o.BusinessName,
                    o.Gstin,
                    $"/organisations/{o.Id}"))
                .ToListAsync(cancellationToken);

            results.AddRange(orgs);
        }

        // ── Other types: return stub entries (cross-service fan-out Phase 7) ───
        // document, return, notice, callback, loan, itr, plan results come from
        // dedicated services. Placeholder empty lists returned here.
        // The frontend CommandPalette calls this endpoint for fast auth-schema hits
        // and calls individual service search endpoints for domain-specific results.

        return new GlobalSearchResultDto(request.Q, results, results.Count);
    }
}
