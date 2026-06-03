using AuthService.Application.TwoFactor.Commands.ConfirmTotp;
using AuthService.Application.TwoFactor.Commands.DisableTotp;
using AuthService.Application.TwoFactor.Commands.EnrollTotp;
using AuthService.Application.TwoFactor.Commands.TwoFaChallenge;
using AuthService.Application.TwoFactor.Queries.GetTotpStatus;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// 2FA TOTP endpoints.
/// /auth/me/2fa/* — require authorization (user must be logged in).
/// /auth/2fa/challenge — anonymous (used during the login flow before the JWT is issued).
/// </summary>
public sealed class TwoFactor : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Authenticated 2FA management ──────────────────────────────────────

        // POST /auth/me/2fa/enroll — generate TOTP secret, store encrypted + unconfirmed
        groupBuilder.MapPost("/me/2fa/enroll", EnrollTotp).RequireAuthorization();

        // POST /auth/me/2fa/confirm { code } — verify first TOTP code, issue recovery codes
        groupBuilder.MapPost("/me/2fa/confirm", ConfirmTotp).RequireAuthorization();

        // POST /auth/me/2fa/disable { code } — verify TOTP/recovery code, disable 2FA
        groupBuilder.MapPost("/me/2fa/disable", DisableTotp).RequireAuthorization();

        // GET /auth/me/2fa/status — { enabled, confirmedAt }
        groupBuilder.MapGet("/me/2fa/status", GetTotpStatus).RequireAuthorization();

        // ── Anonymous challenge (2FA login second step) ───────────────────────

        // POST /auth/2fa/challenge { challengeToken, code } — complete 2FA login, get JWT
        groupBuilder.MapPost("/2fa/challenge", TwoFaChallenge);
    }

    // POST /auth/me/2fa/enroll [Authorize]
    private static async Task<IResult> EnrollTotp(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new EnrollTotpCommand(), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // POST /auth/me/2fa/confirm [Authorize]
    private static async Task<IResult> ConfirmTotp(ConfirmTotpRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ConfirmTotpCommand(req.Code), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // POST /auth/me/2fa/disable [Authorize]
    private static async Task<IResult> DisableTotp(DisableTotpRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DisableTotpCommand(req.Code), ct);
        return result.IsSuccess
            ? Results.NoContent()
            : MapError(result.Error);
    }

    // GET /auth/me/2fa/status [Authorize]
    private static async Task<IResult> GetTotpStatus(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetTotpStatusQuery(), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Unauthorized();
    }

    // POST /auth/2fa/challenge [Anonymous]
    private static async Task<IResult> TwoFaChallenge(TwoFaChallengeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new TwoFaChallengeCommand(req.ChallengeToken, req.Code), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    private static IResult MapError(Error error) =>
        error.Type switch
        {
            ErrorType.NotFound => Results.NotFound(new { error = error.Message, code = error.Code }),
            ErrorType.Conflict => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 409),
            ErrorType.Unauthorized => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 401),
            _ => Results.BadRequest(new { error = error.Message, code = error.Code })
        };
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

internal record ConfirmTotpRequest(string Code);
internal record DisableTotpRequest(string Code);
internal record TwoFaChallengeRequest(string ChallengeToken, string Code);
