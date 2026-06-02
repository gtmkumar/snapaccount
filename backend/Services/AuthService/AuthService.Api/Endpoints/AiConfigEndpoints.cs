using AuthService.Application.AiConfig.Commands.RecordAiUsage;
using AuthService.Application.AiConfig.Commands.TestAiConnection;
using AuthService.Application.AiConfig.Commands.UpdateAiConfig;
using AuthService.Application.AiConfig.Commands.UpsertAiPrice;
using AuthService.Application.AiConfig.Queries.GetAiConfig;
using AuthService.Application.AiConfig.Queries.GetAiPrices;
using AuthService.Application.AiConfig.Queries.GetAiUsage;
using AuthService.Application.AiConfig.Queries.GetEffectiveAiConfig;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// AI model configuration endpoints (admin "AI Model Configuration" settings panel) under /auth.
/// Provider/model/tier + encrypted provider keys are platform-wide and Super-Admin-managed.
/// </summary>
public sealed class AiConfigEndpoints : EndpointGroupBase
{
    public override string? GroupName => "/auth";

    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/config/ai — current config + masked key statuses
        group.MapGet("/config/ai", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAiConfigQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization().WithName("GetAiConfig");

        // PATCH /auth/config/ai — update config and/or set provider keys (write-only)
        group.MapPatch("/config/ai", static async (UpdateAiConfigCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        }).RequireAuthorization().WithName("UpdateAiConfig");

        // GET /auth/config/ai/effective?provider=gemini — service-to-service (returns decrypted key)
        group.MapGet("/config/ai/effective", static async (string? provider, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetEffectiveAiConfigQuery(provider), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization().WithName("GetEffectiveAiConfig");

        // GET /auth/config/ai/usage — aggregated current-month usage metrics (calls/cost/latency)
        group.MapGet("/config/ai/usage", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAiUsageQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization().WithName("GetAiUsage");

        // POST /auth/config/ai/usage — record one metered AI call (service-to-service telemetry)
        group.MapPost("/config/ai/usage", static async (RecordAiUsageCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        }).RequireAuthorization().WithName("RecordAiUsage");

        // GET /auth/config/ai/prices — maintained price catalog
        group.MapGet("/config/ai/prices", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAiPricesQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization().WithName("GetAiPrices");

        // PUT /auth/config/ai/prices — upsert a catalog rate (Super Admin)
        group.MapPut("/config/ai/prices", static async (UpsertAiPriceCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess ? Results.Ok(new { id = result.Value }) : MapError(result.Error);
        }).RequireAuthorization().WithName("UpsertAiPrice");

        // POST /auth/config/ai/test — validate the active provider's credentials (cheap, no tokens)
        group.MapPost("/config/ai/test", static async (TestAiConnectionCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body ?? new TestAiConnectionCommand(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        }).RequireAuthorization().WithName("TestAiConnection");
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        ErrorType.Unauthorized => Results.Unauthorized(),
        ErrorType.Forbidden => Results.Forbid(),
        _ => Results.BadRequest(new { error = error.Message, code = error.Code })
    };
}
