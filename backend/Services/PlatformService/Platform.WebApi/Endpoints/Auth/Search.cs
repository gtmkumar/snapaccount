using AuthService.Application.Search.Queries.GlobalSearch;
using MediatR;
using SnapAccount.Shared.Api;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Command palette / Cmd+K global search endpoint.
/// GET /search?q=&amp;types=user,document,...
/// Searches the auth schema (users, organisations) and returns typed hits.
/// P95 target: &lt;250ms warm.
/// Cross-service fan-out for document/loan/itr/plan types is Phase 7.
/// </summary>
public sealed class Search : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/search";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        g.MapGet("/", DoSearch)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GlobalSearch")
            .WithSummary("Command palette (Cmd+K) global search aggregator.")
            .WithDescription(
                "Searches auth schema for users and organisations. " +
                "Types supported in this phase: user, organisation. " +
                "Other types (document, return, notice, loan, itr, plan) return empty lists — Phase 7. " +
                "P95 target: <250ms warm.");
    }

    private static async Task<IResult> DoSearch(
        [AsParameters] SearchParams p,
        ISender sender,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(p.Q) || p.Q.Trim().Length < 2)
            return Results.BadRequest(new { error = "Query must be at least 2 characters." });

        var types = string.IsNullOrEmpty(p.Types)
            ? null
            : (IReadOnlyList<string>)p.Types.Split(',', StringSplitOptions.RemoveEmptyEntries);

        var result = await sender.Send(new GlobalSearchQuery(p.Q.Trim(), types), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }
}

internal record SearchParams(string? Q = null, string? Types = null);
