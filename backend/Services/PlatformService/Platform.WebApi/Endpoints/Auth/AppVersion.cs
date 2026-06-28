using AuthService.Application.Config.Queries.GetAppVersionPolicy;
using MediatR;
using SnapAccount.Shared.Api;

namespace AuthService.Api.Endpoints;

/// <summary>
/// GAP-116 — App version policy (mobile force-update / minimum-supported-version kill-switch).
///
/// Endpoints:
///   GET /app/min-version?platform={ios|android}&amp;version={x.y.z}
///       — anonymous; called at app launch (before login) to decide whether to soft-nudge
///         ("update available") or hard-block ("update required") the client.
///
/// Routed at the gateway via the <c>platform-app</c> route (<c>/app/{**catch-all}</c> → platform).
/// </summary>
public sealed class AppVersion : EndpointGroupBase
{
    /// <summary>Route prefix: /app.</summary>
    public override string? GroupName => "/app";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // Anonymous by design: the mobile app must be able to query the version floor BEFORE
        // the user authenticates (the block screen can appear on a fresh install).
        groupBuilder.MapGet("/min-version", GetMinVersion)
            .WithSummary("Return the minimum-supported and latest app version for a client platform, "
                       + "plus update-required / update-available verdicts for the supplied current version.");
    }

    private static async Task<IResult> GetMinVersion(
        ISender sender,
        CancellationToken ct,
        string? platform = null,
        string? version = null)
    {
        var result = await sender.Send(
            new GetAppVersionPolicyQuery(platform ?? "ios", version), ct);

        // This handler never fails (fail-open), but keep the standard envelope mapping.
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Problem(result.Error.Message);
    }
}
