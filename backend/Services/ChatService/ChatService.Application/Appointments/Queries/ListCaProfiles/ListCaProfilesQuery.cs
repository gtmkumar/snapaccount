using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Queries.ListCaProfiles;

/// <summary>
/// Lists all CA profiles available for booking (active only by default).
/// Intended for the admin CA-profile UI — replaces the workaround of calling
/// /auth/admin/team-members?role=CA and cross-referencing availability data.
///
/// RBAC: requires chat.appointments.book (same read tier as appointment listing).
/// </summary>
[RequiresPermission("chat.appointments.book")]
public record ListCaProfilesQuery(
    bool ActiveOnly = true,
    int Page = 1,
    int PageSize = 50) : IQuery<ListCaProfilesResponse>;

/// <summary>A single CA profile summary DTO returned by the listing.</summary>
public record CaProfileSummaryDto(
    Guid CaProfileId,
    Guid UserId,
    string DisplayName,
    string? Bio,
    string? Specialisations,
    decimal AverageRating,
    int RatingCount,
    bool IsActive,
    DateTime CreatedAt);

/// <summary>Paginated CA profiles response.</summary>
public record ListCaProfilesResponse(
    IReadOnlyList<CaProfileSummaryDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Validates ListCaProfilesQuery.</summary>
public sealed class ListCaProfilesQueryValidator : AbstractValidator<ListCaProfilesQuery>
{
    public ListCaProfilesQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>
/// Handles ListCaProfilesQuery.
/// Queries chat.ca_profiles directly — no cross-schema join needed because
/// CaProfile.DisplayName is authoritative (set when the admin creates the profile).
/// </summary>
public sealed class ListCaProfilesQueryHandler(
    IChatServiceDbContext db) : IQueryHandler<ListCaProfilesQuery, ListCaProfilesResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListCaProfilesResponse>> Handle(
        ListCaProfilesQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.CaProfiles.AsQueryable();

        if (request.ActiveOnly)
            query = query.Where(p => p.IsActive);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(p => p.DisplayName)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(p => new CaProfileSummaryDto(
                p.Id,
                p.UserId,
                p.DisplayName,
                p.Bio,
                p.Specialisations,
                p.AverageRating,
                p.RatingCount,
                p.IsActive,
                p.CreatedAt))
            .ToListAsync(cancellationToken);

        return Result<ListCaProfilesResponse>.Success(
            new ListCaProfilesResponse(items, total, request.Page, request.PageSize));
    }
}
