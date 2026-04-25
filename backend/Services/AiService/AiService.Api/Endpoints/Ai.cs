using SnapAccount.Shared.Api;

namespace AiService.Api.Endpoints;

/// <summary>
/// All /ai endpoints — chat, document embedding, semantic search, tax advice.
/// Currently stub (Phase 2) — all endpoints return 501 Not Implemented.
/// Application-layer-only service (no domain entities today).
/// SEC-004: All AI endpoints require authorization. SEC-011: AI endpoints rate-limited to 20 req/min.
/// </summary>
public sealed class Ai : EndpointGroupBase
{
    public override string? GroupName => "/ai";

    public override void Map(RouteGroupBuilder groupBuilder)
    {
        groupBuilder.MapPost("/chat",
            () => Results.Json(new { message = "Not yet implemented" }, statusCode: 501))
            .RequireAuthorization().RequireRateLimiting("ai");
        groupBuilder.MapPost("/chat/{sessionId:guid}/message",
            (Guid sessionId) => Results.Json(new { message = "Not yet implemented" }, statusCode: 501))
            .RequireAuthorization().RequireRateLimiting("ai");
        groupBuilder.MapPost("/documents/{documentId:guid}/embed",
            (Guid documentId) => Results.Json(new { message = "Not yet implemented" }, statusCode: 501))
            .RequireAuthorization().RequireRateLimiting("ai");
        groupBuilder.MapPost("/search",
            () => Results.Json(new { message = "Not yet implemented" }, statusCode: 501))
            .RequireAuthorization().RequireRateLimiting("ai");
        groupBuilder.MapPost("/tax-advice",
            () => Results.Json(new { message = "Not yet implemented" }, statusCode: 501))
            .RequireAuthorization().RequireRateLimiting("ai");
    }
}
