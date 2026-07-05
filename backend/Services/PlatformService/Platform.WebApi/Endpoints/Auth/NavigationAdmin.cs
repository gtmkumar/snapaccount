using AuthService.Application.Navigation.Commands.CreateNavigationItem;
using AuthService.Application.Navigation.Commands.DeleteNavigationItem;
using AuthService.Application.Navigation.Commands.UpdateNavigationItem;
using AuthService.Application.Navigation.Queries.GetNavigationAdmin;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Menu Management — CRUD over the backend-driven navigation catalog
/// (auth.navigation_item + auth.menu_permission). SUPER_ADMIN only
/// (platform.permissions.manage, enforced by PermissionBehavior on each command).
/// </summary>
public sealed class NavigationAdmin : EndpointGroupBase
{
    public override string? GroupName => "/auth/admin/navigation";

    public override void Map(RouteGroupBuilder group)
    {
        group.MapGet("", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetNavigationAdminQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization().WithSummary("Full navigation catalog (active + inactive) with permission mappings.");

        group.MapPost("", static async (CreateNavigationItemRequest req, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new CreateNavigationItemCommand(
                req.Key, req.Label, req.Url, req.IconKey, req.DisplayOrder, req.ParentId, req.PermissionIds), ct);
            return result.IsSuccess
                ? Results.Created($"/auth/admin/navigation/{result.Value}", new { id = result.Value })
                : MapError(result.Error);
        }).RequireAuthorization().WithSummary("Create a menu item + its permission mappings.");

        group.MapPut("/{id:guid}", static async (Guid id, UpdateNavigationItemRequest req, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new UpdateNavigationItemCommand(
                id, req.Label, req.Url, req.IconKey, req.DisplayOrder, req.ParentId, req.IsActive, req.PermissionIds), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        }).RequireAuthorization().WithSummary("Edit a menu item (key immutable) + reconcile permission mappings.");

        group.MapDelete("/{id:guid}", static async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new DeleteNavigationItemCommand(id), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        }).RequireAuthorization().WithSummary("Soft-delete a menu item (children promoted to top level).");
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

internal record CreateNavigationItemRequest(
    string Key, string Label, string Url, string? IconKey = null,
    int DisplayOrder = 0, Guid? ParentId = null, IReadOnlyList<Guid>? PermissionIds = null);

internal record UpdateNavigationItemRequest(
    string Label, string Url, string? IconKey = null,
    int DisplayOrder = 0, Guid? ParentId = null, bool IsActive = true,
    IReadOnlyList<Guid>? PermissionIds = null);
