using AuthService.Application.Admin.Commands.CreateUserAdmin;
using AuthService.Application.Admin.Commands.DeleteUserAdmin;
using AuthService.Application.Admin.Commands.SetUserActiveAdmin;
using AuthService.Application.Admin.Commands.UpdateUserAdmin;
using AuthService.Application.Admin.Queries.GetAssignableRoles;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Increment 1.3 — Platform admin user management.
///
/// POST /auth/admin/users          — create user + assign role + optional direct permission overrides
/// GET  /auth/assignable-roles     — roles the caller may assign (delegation-filtered dropdown)
/// </summary>
public sealed class AdminUsers : EndpointGroupBase
{
    public override string? GroupName => "/auth/admin";

    public override void Map(RouteGroupBuilder group)
    {
        // POST /auth/admin/users
        group.MapPost("/users", CreateUser)
            .RequireAuthorization()
            .WithSummary(
                "Create a new user account with a role and optional direct permission overrides. " +
                "scope=platform assigns a platform (UserRole) role; scope=org assigns an org membership. " +
                "Delegation rule enforced: role perms + override perms must ⊆ caller's effective set. " +
                "Requires platform.admins.invite. " +
                "initialPassword only takes effect when LOCAL_AUTH=true.");

        // GET /auth/assignable-roles?scope=platform|org
        group.MapGet("/assignable-roles", GetAssignableRoles)
            .RequireAuthorization()
            .WithSummary(
                "Roles the caller may assign for the given scope. " +
                "Only roles whose permission set ⊆ caller's effective set are returned. " +
                "Use this to populate the role dropdown in the Create User dialog.");

        // PUT /auth/admin/users/{id}
        group.MapPut("/users/{id:guid}", UpdateUser)
            .RequireAuthorization()
            .WithSummary(
                "Edit an existing user: name, preferred language, user type, active state, " +
                "KYC profile, role (within the user's existing scope) and permission overrides. " +
                "Email/phone/scope/organization are immutable. Same delegation rules as create " +
                "(role + override perms must ⊆ caller's effective set; wildcard-only platform-role gate). " +
                "Requires platform.admins.invite.");

        // DELETE /auth/admin/users/{id}
        group.MapDelete("/users/{id:guid}", DeleteUser)
            .RequireAuthorization()
            .WithSummary(
                "Soft-delete a user. Refuses self-delete (409 User.SelfDelete) and removal of the " +
                "last active wildcard SUPER_ADMIN (409 User.LastAdmin). Requires platform.admins.invite.");

        // POST /auth/admin/users/{id}/deactivate — reversible access lock (Team › Staff)
        group.MapPost("/users/{id:guid}/deactivate", DeactivateUser)
            .RequireAuthorization()
            .WithSummary(
                "Deactivate a user (sets IsActive=false; roles/permissions untouched). Refuses " +
                "self-deactivation (409 User.SelfDelete) and the last active wildcard SUPER_ADMIN " +
                "(409 User.LastAdmin). Requires platform.admins.invite.");

        // POST /auth/admin/users/{id}/activate — reverse of deactivate
        group.MapPost("/users/{id:guid}/activate", ActivateUser)
            .RequireAuthorization()
            .WithSummary("Reactivate a previously deactivated user. Requires platform.admins.invite.");
    }

    // POST /auth/admin/users
    private static async Task<IResult> CreateUser(
        CreateUserAdminRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateUserAdminCommand(
            req.FullName,
            req.Email,
            req.PhoneNumber,
            req.Scope,
            req.RoleId,
            req.OrganizationId,
            req.PermissionIds,
            req.InitialPassword,
            req.PreferredLanguage,
            req.UserType,
            req.IsActive ?? true,
            req.Profile), ct);

        return result.IsSuccess
            ? Results.Created($"/auth/admin/users/{result.Value.UserId}", result.Value)
            : MapError(result.Error);
    }

    // GET /auth/assignable-roles?scope=platform|org
    private static async Task<IResult> GetAssignableRoles(
        string scope, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetAssignableRolesQuery(scope ?? "org"), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // PUT /auth/admin/users/{id}
    private static async Task<IResult> UpdateUser(
        Guid id, UpdateUserAdminRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new UpdateUserAdminCommand(
            id,
            req.FullName,
            req.RoleId,
            req.PermissionIds,
            req.PreferredLanguage,
            req.UserType,
            req.IsActive ?? true,
            req.Profile,
            req.DeniedPermissionIds), ct);

        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // DELETE /auth/admin/users/{id}
    private static async Task<IResult> DeleteUser(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeleteUserAdminCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // POST /auth/admin/users/{id}/deactivate
    private static async Task<IResult> DeactivateUser(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SetUserActiveAdminCommand(id, false), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // POST /auth/admin/users/{id}/activate
    private static async Task<IResult> ActivateUser(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SetUserActiveAdminCommand(id, true), ct);
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

// ── Request DTO ───────────────────────────────────────────────────────────────

/// <summary>POST /auth/admin/users request body.</summary>
internal record CreateUserAdminRequest(
    string FullName,
    string Email,
    string? PhoneNumber,
    string Scope,
    Guid RoleId,
    Guid? OrganizationId = null,
    IReadOnlyList<Guid>? PermissionIds = null,
    string? InitialPassword = null,
    string? PreferredLanguage = null,
    string? UserType = null,
    bool? IsActive = null,
    AuthService.Application.Admin.Commands.CreateUserAdmin.UserProfileInput? Profile = null);

/// <summary>PUT /auth/admin/users/{id} request body. Email/phone/scope/org are immutable.</summary>
internal record UpdateUserAdminRequest(
    string FullName,
    Guid RoleId,
    IReadOnlyList<Guid>? PermissionIds = null,
    string? PreferredLanguage = null,
    string? UserType = null,
    bool? IsActive = null,
    AuthService.Application.Admin.Commands.UpdateUserAdmin.UserProfileInput? Profile = null,
    IReadOnlyList<Guid>? DeniedPermissionIds = null);
