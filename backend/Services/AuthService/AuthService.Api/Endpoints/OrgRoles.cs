using AuthService.Application.Roles.Commands.CreateOrgRole;
using AuthService.Application.Roles.Commands.DeleteOrgRole;
using AuthService.Application.Roles.Commands.SetRolePermissions;
using AuthService.Application.Roles.Commands.UpdateOrgRole;
using AuthService.Application.Roles.Queries.GetOrgRoleDetail;
using AuthService.Application.Roles.Queries.GetOrgRoles;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Org-scoped Role management endpoints.
/// All routes require authentication + RBAC via PermissionBehavior.
///
/// Rate limit: standard (100 req/min per user — inherited from global config).
/// </summary>
public sealed class OrgRoles : EndpointGroupBase
{
    public override string? GroupName => "/auth/org/roles";

    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/org/roles
        group.MapGet("/", ListRoles)
            .RequireAuthorization()
            .WithSummary("List all roles visible to the caller's org (system + custom).");

        // POST /auth/org/roles
        group.MapPost("/", CreateRole)
            .RequireAuthorization()
            .WithSummary("Create a custom role scoped to the caller's organization.");

        // GET /auth/org/roles/{id}
        group.MapGet("/{id:guid}", GetRole)
            .RequireAuthorization()
            .WithSummary("Get a single role with its full permission list.");

        // PUT /auth/org/roles/{id}
        group.MapPut("/{id:guid}", UpdateRole)
            .RequireAuthorization()
            .WithSummary("Update displayName/description of a custom role.");

        // DELETE /auth/org/roles/{id}
        group.MapDelete("/{id:guid}", DeleteRole)
            .RequireAuthorization()
            .WithSummary("Soft-delete a custom role (must have no active members).");

        // GET /auth/org/roles/{id}/permissions
        group.MapGet("/{id:guid}/permissions", GetRolePermissions)
            .RequireAuthorization()
            .WithSummary("Get the permissions assigned to a specific role.");

        // PUT /auth/org/roles/{id}/permissions
        group.MapPut("/{id:guid}/permissions", SetRolePermissions)
            .RequireAuthorization()
            .WithSummary("Replace the permission set of a custom role. Delegation rule enforced server-side.");
    }

    // GET /auth/org/roles
    private static async Task<IResult> ListRoles(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrgRolesQuery(), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // POST /auth/org/roles
    private static async Task<IResult> CreateRole(
        CreateOrgRoleRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateOrgRoleCommand(req.Name, req.DisplayName, req.Description), ct);
        return result.IsSuccess
            ? Results.Created($"/auth/org/roles/{result.Value.RoleId}", result.Value)
            : MapError(result.Error);
    }

    // GET /auth/org/roles/{id}
    private static async Task<IResult> GetRole(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrgRoleDetailQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // PUT /auth/org/roles/{id}
    private static async Task<IResult> UpdateRole(
        Guid id, UpdateOrgRoleRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new UpdateOrgRoleCommand(id, req.DisplayName, req.Description), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // DELETE /auth/org/roles/{id}
    private static async Task<IResult> DeleteRole(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeleteOrgRoleCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // GET /auth/org/roles/{id}/permissions — returns the role's permission list
    private static async Task<IResult> GetRolePermissions(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrgRoleDetailQuery(id), ct);
        return result.IsSuccess
            ? Results.Ok(new { roleId = id, permissions = result.Value.Permissions })
            : MapError(result.Error);
    }

    // PUT /auth/org/roles/{id}/permissions
    private static async Task<IResult> SetRolePermissions(
        Guid id, SetRolePermissionsRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SetRolePermissionsCommand(id, req.PermissionIds), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound    => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Forbidden   => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
        ErrorType.Conflict    => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Validation  => Results.BadRequest(new { error = error.Message, code = error.Code }),
        _                     => Results.Problem(error.Message),
    };
}

// Request DTOs
internal record CreateOrgRoleRequest(string Name, string DisplayName, string? Description = null);
internal record UpdateOrgRoleRequest(string DisplayName, string? Description = null);
internal record SetRolePermissionsRequest(IReadOnlyList<Guid> PermissionIds);
