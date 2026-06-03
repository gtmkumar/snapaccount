using AuthService.Application.Organizations.Commands.CreateOrganization;
using AuthService.Application.PlatformAdmin.Commands.SuspendOrganization;
using AuthService.Application.PlatformAdmin.Commands.UpdateOrganizationSettings;
using AuthService.Application.PlatformAdmin.Queries.ListOrgInvitesForAdmin;
using AuthService.Application.PlatformAdmin.Queries.ListOrgMembersForAdmin;
using AuthService.Application.PlatformAdmin.Queries.ListPlatformOrganizations;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Platform administration endpoints (SUPER_ADMIN only).
/// Requires the platform.orgs.* permissions for org management operations.
///
/// Standard rate limit: 100 req/min per user.
/// </summary>
public sealed class PlatformAdmin : EndpointGroupBase
{
    public override string? GroupName => "/auth/admin";

    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/admin/organizations?page=&pageSize=&search=&isActive=
        group.MapGet("/organizations", ListOrganizations)
            .RequireAuthorization()
            .WithSummary("List all organizations (SUPER_ADMIN only). Paginated with optional search.");

        // POST /auth/admin/organizations
        group.MapPost("/organizations", CreateOrganizationAdmin)
            .RequireAuthorization()
            .WithSummary("Create a new organization (SUPER_ADMIN can create orgs for clients).");

        // POST /auth/admin/organizations/{id}/suspend
        group.MapPost("/organizations/{id:guid}/suspend", SuspendOrg)
            .RequireAuthorization()
            .WithSummary("Suspend an organization (SUPER_ADMIN only). Sets is_active=false.");

        // GET /auth/admin/organizations/{orgId}/members?page=&pageSize=
        group.MapGet("/organizations/{orgId:guid}/members", ListOrgMembers)
            .RequireAuthorization()
            .WithSummary("List members of a specific organization (SUPER_ADMIN only). " +
                         "Returns the same OrgMembersListDto shape as GET /auth/org/members.");

        // GET /auth/admin/organizations/{orgId}/invites
        group.MapGet("/organizations/{orgId:guid}/invites", ListOrgInvites)
            .RequireAuthorization()
            .WithSummary("List all invitations for a specific organization (SUPER_ADMIN only). " +
                         "Returns the same OrgInviteDto[] shape as GET /auth/org/invites.");

        // PATCH /auth/admin/organizations/{orgId}/settings
        group.MapPatch("/organizations/{orgId:guid}/settings", UpdateOrgSettings)
            .RequireAuthorization()
            .WithSummary("Update configurable settings for an organization (org.settings.update). " +
                         "Currently supports: governmentVerificationEnabled.");
    }

    // GET /auth/admin/organizations
    private static async Task<IResult> ListOrganizations(
        int? page, int? pageSize, string? search, bool? isActive,
        ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new ListPlatformOrganizationsQuery(page ?? 1, pageSize ?? 20, search, isActive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/admin/organizations
    private static async Task<IResult> CreateOrganizationAdmin(
        CreateOrgAdminRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateOrganizationCommand(
            req.BusinessName, req.Gstin, req.PanNumber, req.BusinessType, null, null), ct);
        return result.IsSuccess
            ? Results.Created($"/auth/admin/organizations/{result.Value.OrganizationId}", result.Value)
            : MapError(result.Error);
    }

    // POST /auth/admin/organizations/{id}/suspend
    private static async Task<IResult> SuspendOrg(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SuspendOrganizationCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // GET /auth/admin/organizations/{orgId}/members?page=&pageSize=
    private static async Task<IResult> ListOrgMembers(
        Guid orgId, int? page, int? pageSize,
        ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new ListOrgMembersForAdminQuery(orgId, page ?? 1, pageSize ?? 20), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // GET /auth/admin/organizations/{orgId}/invites
    private static async Task<IResult> ListOrgInvites(
        Guid orgId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListOrgInvitesForAdminQuery(orgId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // PATCH /auth/admin/organizations/{orgId}/settings
    private static async Task<IResult> UpdateOrgSettings(
        Guid orgId, UpdateOrgSettingsRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateOrganizationSettingsCommand(orgId, req.GovernmentVerificationEnabled), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
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

// Request DTOs
internal record CreateOrgAdminRequest(
    string BusinessName,
    string? Gstin = null,
    string? PanNumber = null,
    string? BusinessType = null);

/// <summary>
/// Body for PATCH /auth/admin/organizations/{orgId}/settings.
/// Extensible — additional settings can be added as nullable fields without breaking callers.
/// </summary>
internal record UpdateOrgSettingsRequest(bool GovernmentVerificationEnabled);
