using AuthService.Application.PermissionCatalog.Commands.CreatePermission;
using AuthService.Application.PermissionCatalog.Commands.DeletePermission;
using AuthService.Application.PermissionCatalog.Commands.UpdatePermission;
using AuthService.Application.PermissionCatalog.Queries.GetGrantablePermissions;
using AuthService.Application.PermissionCatalog.Queries.GetPermissionCatalog;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Permission catalog endpoints.
///
/// Read (existing):
///   GET  /auth/permissions                — full catalog grouped by module
///   GET  /auth/me/grantable-permissions   — subset the caller may delegate
///
/// Write (TASK B — SUPER_ADMIN only, requires platform.permissions.manage):
///   POST   /auth/permissions              — add a new catalog entry
///   PUT    /auth/permissions/{id}         — update description (name immutable)
///   DELETE /auth/permissions/{id}         — soft-delete (blocked if in use)
/// </summary>
public sealed class PermissionsEndpoints : EndpointGroupBase
{
    public override string? GroupName => "/auth";

    public override void Map(RouteGroupBuilder group)
    {
        // ── Read ─────────────────────────────────────────────────────────────

        // GET /auth/permissions
        group.MapGet("/permissions", GetCatalog)
            .RequireAuthorization()
            .WithSummary(
                "Full permission catalog grouped by module. " +
                "Required permission: org.permissions.read.");

        // GET /auth/me/grantable-permissions
        group.MapGet("/me/grantable-permissions", GetGrantable)
            .RequireAuthorization()
            .WithSummary(
                "Permission IDs the caller may grant to other roles. " +
                "Drives greyed/disabled toggles in the permission matrix UI.");

        // ── Write (TASK B) ────────────────────────────────────────────────────

        // POST /auth/permissions
        group.MapPost("/permissions", CreatePermission)
            .RequireAuthorization()
            .WithSummary(
                "Add a new entry to the global permission catalog. " +
                "Required permission: platform.permissions.manage. " +
                "Name must be lowercase dot-notation (e.g. 'gst.returns.file'). " +
                "NOTE: adding a permission here does NOT make it enforce access in code — " +
                "only [RequiresPermission] decorations on commands/queries do that.");

        // PUT /auth/permissions/{id}
        group.MapPut("/permissions/{id:guid}", UpdatePermission)
            .RequireAuthorization()
            .WithSummary(
                "Update description and/or isActive (retire/re-activate) of a catalog permission. " +
                "Name/resource/action are immutable. " +
                "Required permission: platform.permissions.manage.");

        // DELETE /auth/permissions/{id}
        group.MapDelete("/permissions/{id:guid}", DeletePermission)
            .RequireAuthorization()
            .WithSummary(
                "Soft-delete a catalog permission. " +
                "Blocked (409) if the permission is currently granted to any roles. " +
                "Required permission: platform.permissions.manage.");
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    // GET /auth/permissions?includeInactive=false
    // includeInactive=true → shows retired permissions too (SUPER_ADMIN catalog screen)
    private static async Task<IResult> GetCatalog(
        ISender sender, CancellationToken ct, bool includeInactive = false)
    {
        var result = await sender.Send(new GetPermissionCatalogQuery(includeInactive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // GET /auth/me/grantable-permissions
    private static async Task<IResult> GetGrantable(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetGrantablePermissionsQuery(), ct);
        return result.IsSuccess
            ? Results.Ok(new { grantablePermissionIds = result.Value })
            : MapError(result.Error);
    }

    // POST /auth/permissions
    private static async Task<IResult> CreatePermission(
        CreatePermissionRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreatePermissionCommand(req.Name, req.Description), ct);
        return result.IsSuccess
            ? Results.Created($"/auth/permissions/{result.Value.Id}", result.Value)
            : MapError(result.Error);
    }

    // PUT /auth/permissions/{id}
    private static async Task<IResult> UpdatePermission(
        Guid id, UpdatePermissionRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new UpdatePermissionCommand(id, req.Description, req.IsActive), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // DELETE /auth/permissions/{id}
    private static async Task<IResult> DeletePermission(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeletePermissionCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound   => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Forbidden  => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
        ErrorType.Conflict   => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        _                    => Results.Problem(error.Message),
    };
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

/// <summary>POST /auth/permissions request body.</summary>
internal record CreatePermissionRequest(string Name, string? Description = null);

/// <summary>PUT /auth/permissions/{id} request body.</summary>
internal record UpdatePermissionRequest(string? Description = null, bool? IsActive = null);
