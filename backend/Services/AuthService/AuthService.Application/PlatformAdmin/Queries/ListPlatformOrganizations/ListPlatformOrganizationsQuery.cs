using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PlatformAdmin.Queries.ListPlatformOrganizations;

/// <summary>Returns a paginated list of all organizations (SUPER_ADMIN only).</summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformOrgsRead)]
public record ListPlatformOrganizationsQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    bool? IsActive = null) : IQuery<PlatformOrgListDto>;

/// <summary>Paginated org list for the platform admin view.</summary>
public record PlatformOrgListDto(
    IReadOnlyList<PlatformOrgDto> Items,
    int TotalCount);

/// <summary>Summary DTO for a single organization in the platform admin list.</summary>
public record PlatformOrgDto(
    Guid Id,
    string BusinessName,
    string? Gstin,
    string? PanNumber,
    string? BusinessType,
    bool IsGstRegistered,
    bool IsActive,
    int MemberCount,
    DateTime CreatedAt);

public sealed class ListPlatformOrganizationsQueryHandler(IAuthDbContext db)
    : IQueryHandler<ListPlatformOrganizationsQuery, PlatformOrgListDto>
{
    public async Task<Result<PlatformOrgListDto>> Handle(
        ListPlatformOrganizationsQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.Organizations
            .Where(o => o.DeletedAt == null)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var searchLower = request.Search.ToLower();
            query = query.Where(o =>
                o.BusinessName.ToLower().Contains(searchLower) ||
                (o.Gstin != null && o.Gstin.ToLower().Contains(searchLower)));
        }

        if (request.IsActive.HasValue)
            query = query.Where(o => o.IsActive == request.IsActive.Value);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new PlatformOrgDto(
                o.Id,
                o.BusinessName,
                o.Gstin,
                o.PanNumber,
                o.BusinessType,
                o.IsGstRegistered,
                o.IsActive,
                o.Members.Count(m => m.IsActive && m.DeletedAt == null),
                o.CreatedAt))
            .ToListAsync(cancellationToken);

        return new PlatformOrgListDto(items, total);
    }
}
