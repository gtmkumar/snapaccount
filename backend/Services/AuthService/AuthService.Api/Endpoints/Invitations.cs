using AuthService.Application.Invitations.Commands.AcceptInvitation;
using AuthService.Application.Invitations.Commands.CreateInvitation;
using AuthService.Application.Invitations.Commands.ResendInvitation;
using AuthService.Application.Invitations.Commands.RevokeInvitation;
using AuthService.Application.Invitations.Queries.GetOrgInvites;
using AuthService.Application.Invitations.Queries.ValidateInviteToken;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Invitation endpoints — matching teamApi.ts routes + invite acceptance flow.
///
/// Public routes (no auth required):
///   GET /auth/invite/{token}        — validate token, return org/role details
///   POST /auth/invite/{token}/accept — accept invitation (auth required for account link)
///
/// Org-admin routes (auth + permission required):
///   POST /auth/team/invite            — create invitation (teamApi.ts route)
///   GET  /auth/team/invites           — list pending invitations (teamApi.ts route)
///   POST /auth/team/invites/{id}/resend
///   DELETE /auth/team/invites/{id}
/// </summary>
public sealed class Invitations : EndpointGroupBase
{
    public override string? GroupName => "/auth";

    public override void Map(RouteGroupBuilder group)
    {
        // ── Invite creation + listing (teamApi.ts routes) ──────────────────

        // POST /auth/team/invite
        group.MapPost("/team/invite", CreateInvite)
            .RequireAuthorization()
            .WithSummary("Create a new org invitation. Returns a one-time raw token (show once, never log).");

        // GET /auth/team/invites
        group.MapGet("/team/invites", ListInvites)
            .RequireAuthorization()
            .WithSummary("List all pending and recent invitations for the caller's org.");

        // POST /auth/team/invites/{id}/resend
        group.MapPost("/team/invites/{id:guid}/resend", ResendInvite)
            .RequireAuthorization()
            .WithSummary("Revoke the existing token and issue a new one for the same invitation.");

        // DELETE /auth/team/invites/{id}
        group.MapDelete("/team/invites/{id:guid}", RevokeInvite)
            .RequireAuthorization()
            .WithSummary("Revoke a pending invitation so the token can no longer be used.");

        // ── Public invite acceptance flow ──────────────────────────────────

        // GET /auth/invite/{token} — PUBLIC (no auth required to read invite details)
        // M1-R-INFO-001: rate-limited to 20 req/min per IP to prevent token enumeration.
        group.MapGet("/invite/{token}", ValidateToken)
            .RequireRateLimiting("invite-token-lookup")
            .WithSummary("Validate an invite token. Returns org/role details for the acceptance page.");

        // POST /auth/invite/{token}/accept — requires auth (links authenticated user)
        group.MapPost("/invite/{token}/accept", AcceptInvite)
            .RequireAuthorization()
            .WithSummary("Accept an invitation. Caller's account is linked to the org with the assigned role.");
    }

    // POST /auth/team/invite
    private static async Task<IResult> CreateInvite(
        CreateInviteRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreateInvitationCommand(req.Email, req.Phone, req.Role, req.CustomMessage), ct);
        return result.IsSuccess
            ? Results.Created($"/auth/team/invites/{result.Value.InviteId}",
                // The raw token is returned ONCE so the caller can build a shareable invite
                // link (e.g. mobile owner shares snapaccount://invite/{token}). It is never
                // stored in plaintext server-side (only its SHA-256 hash is persisted) and
                // must never be logged. Returning it here mirrors this endpoint's contract.
                new
                {
                    inviteId = result.Value.InviteId.ToString(),
                    token = result.Value.RawToken,
                    expiresAt = result.Value.ExpiresAt
                })
            : MapError(result.Error);
    }

    // GET /auth/team/invites
    private static async Task<IResult> ListInvites(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrgInvitesQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/team/invites/{id}/resend
    private static async Task<IResult> ResendInvite(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ResendInvitationCommand(id), ct);
        return result.IsSuccess
            ? Results.Ok(new { expiresAt = result.Value.ExpiresAt })
            : MapError(result.Error);
    }

    // DELETE /auth/team/invites/{id}
    private static async Task<IResult> RevokeInvite(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RevokeInvitationCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // GET /auth/invite/{token} — PUBLIC
    private static async Task<IResult> ValidateToken(string token, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ValidateInviteTokenQuery(token), ct);
        if (!result.IsSuccess)
            return MapError(result.Error);

        return result.Value.IsValid
            ? Results.Ok(result.Value)
            : Results.Json(new { isValid = false, message = "This invitation is invalid or has expired." }, statusCode: 410);
    }

    // POST /auth/invite/{token}/accept
    private static async Task<IResult> AcceptInvite(string token, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new AcceptInvitationCommand(token), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound    => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Forbidden   => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
        ErrorType.Conflict    => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Validation  => Results.BadRequest(new { error = error.Message, code = error.Code }),
        ErrorType.Unauthorized => Results.Unauthorized(),
        _                     => Results.Problem(error.Message),
    };
}

// Request DTOs — matching teamApi.ts InviteTeamMemberParams
internal record CreateInviteRequest(
    string Email,
    string Role,
    string? Phone = null,
    string? CustomMessage = null);
