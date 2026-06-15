using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PermissionCatalog.Queries.GetPermissionMeta;

/// <summary>
/// Returns the configurable ResourceType + ActionType catalogs (gap #3). These let
/// an admin compose permissions as Resource × Action instead of typing dotted
/// strings. Active entries only, ordered by key. Read access gated by the same
/// permission-catalog read permission.
/// </summary>
[RequiresPermission(Permissions.PlatformPermissionsManage)]
public record GetPermissionMetaQuery : IQuery<PermissionMetaDto>;

public record PermissionMetaDto(
    IReadOnlyList<TypeEntryDto> ResourceTypes,
    IReadOnlyList<TypeEntryDto> ActionTypes);

public record TypeEntryDto(Guid Id, string Key, string Name, string? Description);

public sealed class GetPermissionMetaQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetPermissionMetaQuery, PermissionMetaDto>
{
    public async Task<Result<PermissionMetaDto>> Handle(GetPermissionMetaQuery request, CancellationToken ct)
    {
        var resources = await db.ResourceTypes
            .Where(r => r.IsActive && r.DeletedAt == null)
            .OrderBy(r => r.Key)
            .Select(r => new TypeEntryDto(r.Id, r.Key, r.Name, r.Description))
            .ToListAsync(ct);

        var actions = await db.ActionTypes
            .Where(a => a.IsActive && a.DeletedAt == null)
            .OrderBy(a => a.Key)
            .Select(a => new TypeEntryDto(a.Id, a.Key, a.Name, a.Description))
            .ToListAsync(ct);

        return Result<PermissionMetaDto>.Success(new PermissionMetaDto(resources, actions));
    }
}
