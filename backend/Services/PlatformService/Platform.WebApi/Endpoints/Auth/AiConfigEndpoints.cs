using System.Security.Cryptography;
using AuthService.Application.AiConfig.Commands.RecordAiUsage;
using AuthService.Application.AiConfig.Commands.TestAiConnection;
using AuthService.Application.AiConfig.Commands.UpdateAiConfig;
using AuthService.Application.AiConfig.Commands.UpsertAiPrice;
using AuthService.Application.AiConfig.Queries.GetAiConfig;
using AuthService.Application.AiConfig.Queries.GetAiPrices;
using AuthService.Application.AiConfig.Queries.GetAiUsage;
using AuthService.Application.AiConfig.Queries.GetEffectiveAiConfig;
using MediatR;
using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application;

namespace AuthService.Api.Endpoints;

/// <summary>
/// AI model configuration endpoints (admin "AI Model Configuration" settings panel) under /auth.
/// Provider/model/tier + encrypted provider keys are platform-wide and Super-Admin-managed.
/// </summary>
public sealed class AiConfigEndpoints : EndpointGroupBase
{
    /// <summary>
    /// HTTP header name used by internal services (AiService, DocumentService) to authenticate
    /// service-to-service calls to the decrypted-key endpoint.
    /// Value is compared against <c>InternalApi:SharedToken</c> in configuration.
    /// SEC-AI-02 H-02: this bypass only activates when the header is present and valid; all
    /// other callers still go through PermissionBehavior (platform.ai.manage required).
    /// </summary>
    public const string InternalTokenHeader = "X-Internal-Token";

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
        //
        // SEC-AI-02 H-02: Access requires EITHER:
        //   (a) An authenticated user with platform.ai.manage permission (admin UI, Super Admin only), OR
        //   (b) A valid X-Internal-Token header matching InternalApi:SharedToken in configuration
        //       (AiService / DocumentService internal service-to-service calls).
        //
        // For (b): the handler is invoked directly (bypassing MediatR + PermissionBehavior) because
        // the internal token IS the credential — the caller has already authenticated at the network
        // perimeter level. For (a): MediatR pipeline enforces [RequiresPermission("platform.ai.manage")].
        // Without either, the endpoint returns 401/403 and the decrypted key is never exposed.
        group.MapGet("/config/ai/effective", static async (
            string? provider,
            ISender sender,
            IRequestHandler<GetEffectiveAiConfigQuery, Result<EffectiveAiConfigDto>> directHandler,
            IConfiguration config,
            HttpContext ctx,
            CancellationToken ct) =>
        {
            // Service-to-service bypass: validate X-Internal-Token via constant-time comparison.
            var internalToken = config["InternalApi:SharedToken"];
            var headerToken = ctx.Request.Headers[InternalTokenHeader].FirstOrDefault();
            var isInternalCall = !string.IsNullOrWhiteSpace(internalToken)
                && !string.IsNullOrWhiteSpace(headerToken)
                && CryptographicEqual(internalToken, headerToken);

            if (isInternalCall)
            {
                // Direct handler invocation — bypasses PermissionBehavior intentionally.
                // The X-Internal-Token is the authentication credential for internal service calls.
                var internalResult = await directHandler.Handle(new GetEffectiveAiConfigQuery(provider), ct);
                return internalResult.IsSuccess ? Results.Ok(internalResult.Value) : MapError(internalResult.Error);
            }

            // Human / admin call — goes through MediatR pipeline including PermissionBehavior
            // which enforces [RequiresPermission("platform.ai.manage")] on the query class.
            var result = await sender.Send(new GetEffectiveAiConfigQuery(provider), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
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

    /// <summary>
    /// Constant-time string comparison for shared-secret tokens.
    ///
    /// RV-01 (SEC-AI-02): <c>CryptographicOperations.FixedTimeEquals</c> returns <c>false</c>
    /// immediately when the two spans differ in length — the comparison is NOT constant-time
    /// for inputs of different lengths, leaking the token length via response timing.
    ///
    /// Fix: HMAC-SHA256 both values under a fixed domain key and compare the 32-byte digests
    /// with <c>FixedTimeEquals</c>. Because both digests are always exactly 32 bytes, the
    /// comparison is unconditionally constant-time regardless of input length. HMAC also
    /// prevents a length-extension attack on the raw hash path.
    /// </summary>
    private static bool CryptographicEqual(string a, string b)
    {
        // Domain-separation key for HMAC — not a secret; prevents raw-hash pre-image reuse.
        // Both sides use the same domain key so the HMAC outputs are comparable.
        ReadOnlySpan<byte> domainKey = "snapaccount.internal-token.v1"u8;

        Span<byte> hashA = stackalloc byte[32];
        Span<byte> hashB = stackalloc byte[32];

        HMACSHA256.TryHashData(
            domainKey,
            System.Text.Encoding.UTF8.GetBytes(a),
            hashA, out _);

        HMACSHA256.TryHashData(
            domainKey,
            System.Text.Encoding.UTF8.GetBytes(b),
            hashB, out _);

        return CryptographicOperations.FixedTimeEquals(hashA, hashB);
    }
}
