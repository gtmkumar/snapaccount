using AuthService.Application.Members.Commands.ReactivateOrgMember;
using AuthService.Application.Members.Commands.RemoveOrgMember;
using AuthService.Application.Members.Commands.SuspendOrgMember;
using AuthService.Application.Members.Commands.UpdateOrgMember;
using AuthService.Application.Members.Queries.GetOrgMembers;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Org member management endpoints — matches teamApi.ts routes exactly.
///
/// The frontend calls /auth/team/* (from teamApi.ts). These routes are aliases
/// mapped here to keep backward compatibility with existing frontend code while
/// implementing proper org-scoped logic.
///
/// Standard rate limit: 100 req/min per user.
/// </summary>
public sealed class OrgMembers : EndpointGroupBase
{
    public override string? GroupName => "/auth/team";

    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/team?role=&status=&page=&pageSize=
        group.MapGet("/", ListMembers)
            .RequireAuthorization()
            .WithSummary("List org members with optional role/status filter and pagination.");

        // PATCH /auth/team/{memberId}
        group.MapPatch("/{memberId:guid}", UpdateMember)
            .RequireAuthorization()
            .WithSummary("Update member's role assignment. Delegation rule enforced server-side.");

        // POST /auth/team/{memberId}/suspend
        group.MapPost("/{memberId:guid}/suspend", SuspendMember)
            .RequireAuthorization()
            .WithSummary("Suspend an active member (sets is_active=false).");

        // POST /auth/team/{memberId}/reactivate
        group.MapPost("/{memberId:guid}/reactivate", ReactivateMember)
            .RequireAuthorization()
            .WithSummary("Reactivate a previously suspended member.");

        // DELETE /auth/team/{memberId}
        group.MapDelete("/{memberId:guid}", RemoveMember)
            .RequireAuthorization()
            .WithSummary("Permanently remove (soft-delete) a member from the org.");
    }

    // GET /auth/team
    private static async Task<IResult> ListMembers(
        string? role, string? status, int? page, int? pageSize,
        ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new GetOrgMembersQuery(role, status, page ?? 1, pageSize ?? 20), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // PATCH /auth/team/{memberId}
    private static async Task<IResult> UpdateMember(
        Guid memberId, UpdateMemberRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new UpdateOrgMemberCommand(memberId, req.Role), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // POST /auth/team/{memberId}/suspend
    private static async Task<IResult> SuspendMember(Guid memberId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SuspendOrgMemberCommand(memberId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // POST /auth/team/{memberId}/reactivate
    private static async Task<IResult> ReactivateMember(Guid memberId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ReactivateOrgMemberCommand(memberId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // DELETE /auth/team/{memberId}
    private static async Task<IResult> RemoveMember(Guid memberId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RemoveOrgMemberCommand(memberId), ct);
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

// Request DTOs (mirror teamApi.ts UpdateMemberParams)
internal record UpdateMemberRequest(string? Role);
