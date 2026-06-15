using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Queries.GetPermissionCatalog;

/// <summary>
/// Returns the permission catalog grouped by module/resource.
///
/// <paramref name="IncludeInactive"/> (default false):
///   false — returns only is_active=true permissions (normal matrix view)
///   true  — returns ALL non-deleted permissions including retired ones
///            (for the SUPER_ADMIN catalog management screen)
///
/// Each <see cref="PermissionDto"/> includes:
///   • isActive   — whether the permission is active or retired
///   • roleCount  — number of active roles that currently hold this grant
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgPermissionsRead)]
public record GetPermissionCatalogQuery(bool IncludeInactive = false) : IQuery<IReadOnlyList<PermissionModuleDto>>;

/// <summary>A logical module grouping (e.g. "org", "gst", "accounting").</summary>
public record PermissionModuleDto(
    string Module,
    string DisplayName,
    IReadOnlyList<PermissionDto> Permissions);

/// <summary>
/// A single permission entry in the catalog.
/// Added in I1.1: <see cref="IsActive"/> and <see cref="RoleCount"/>.
/// </summary>
public record PermissionDto(
    Guid Id,
    string Name,
    string Resource,
    string Action,
    string? Description,
    bool IsActive,
    int RoleCount);

public sealed class GetPermissionCatalogQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetPermissionCatalogQuery, IReadOnlyList<PermissionModuleDto>>
{
    private static readonly Dictionary<string, string> ModuleDisplayNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["org"]          = "Organization Management",
        ["platform"]     = "Platform Administration",
        ["gst"]          = "GST Filing",
        ["accounting"]   = "Accounting",
        ["document"]     = "Documents",
        ["itr"]          = "Income Tax (ITR)",
        ["loan"]         = "Loans",
        ["chat"]         = "Chat & Support",
        ["notification"] = "Notifications",
        ["subscription"] = "Subscriptions",
        ["report"]       = "Reports",
        ["ai"]           = "AI Features",
        ["callback"]     = "Callbacks",
    };

    public async Task<Result<IReadOnlyList<PermissionModuleDto>>> Handle(
        GetPermissionCatalogQuery request,
        CancellationToken cancellationToken)
    {
        // Base filter: never show hard-deleted rows.
        // includeInactive=false → also exclude retired (is_active=false).
        var permissionsQuery = db.Permissions
            .Where(p => p.DeletedAt == null);

        if (!request.IncludeInactive)
            permissionsQuery = permissionsQuery.Where(p => p.IsActive);

        // LEFT-JOIN role_permission to count active grants per permission.
        // "Active grant" = role_permission.deleted_at IS NULL
        //                  AND the role itself is active and not deleted.
        var rows = await (
            from p in permissionsQuery
            join rp in db.RolePermissions
                    .Where(rp => rp.DeletedAt == null)
                on p.Id equals rp.PermissionId into grants
            from rp in grants.DefaultIfEmpty()
            join r in db.Roles
                    .Where(r => r.IsActive && r.DeletedAt == null)
                on (rp == null ? (Guid?)null : (Guid?)rp.RoleId) equals r.Id into roles
            from r in roles.DefaultIfEmpty()
            group new { rp, r } by new
            {
                p.Id, p.Name, p.Resource, p.Action, p.Description, p.IsActive
            } into g
            orderby g.Key.Resource, g.Key.Action
            select new
            {
                g.Key.Id,
                g.Key.Name,
                g.Key.Resource,
                g.Key.Action,
                g.Key.Description,
                g.Key.IsActive,
                RoleCount = g.Count(x => x.r != null)
            }
        ).ToListAsync(cancellationToken);

        var grouped = rows
            .GroupBy(p => p.Resource, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => ModuleDisplayNames.ContainsKey(g.Key) ? 0 : 1)
            .ThenBy(g => g.Key)
            .Select(g => new PermissionModuleDto(
                Module: g.Key,
                DisplayName: ModuleDisplayNames.GetValueOrDefault(g.Key, g.Key),
                Permissions: g.Select(p => new PermissionDto(
                    p.Id, p.Name, p.Resource, p.Action, p.Description,
                    p.IsActive, p.RoleCount)).ToList()))
            .ToList();

        return Result<IReadOnlyList<PermissionModuleDto>>.Success(grouped);
    }
}
