using AuthService.Application.Config.Commands.UpdatePlatformConfig;
using AuthService.Application.Config.Queries.GetPlatformConfig;
using AuthService.Application.FeatureFlags.Commands.SetFeatureFlag;
using AuthService.Application.FeatureFlags.Queries.GetFeatureFlags;
using AuthService.Application.Organizations.Commands.UpdateOrgSettings;
using AuthService.Application.Organizations.Queries.GetOrgSettings;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Settings endpoints for the admin panel's Settings hub.
/// SEC-056: implements the previously ghost routes that the frontend settings
/// pages were calling without a backend implementation.
///
/// Endpoints:
///   GET  /auth/org/settings                  — self-service org settings (business name, address, logo)
///   PATCH /auth/org/settings                 — update mutable org settings
///   GET  /auth/feature-flags                 — list all platform feature flags
///   PATCH /auth/feature-flags/{flag}         — enable or disable a feature flag
///   GET  /auth/config/language               — platform language / locale config
///   PATCH /auth/config/language              — update language config
///   GET  /auth/config/whatsapp               — WhatsApp integration config
///   PATCH /auth/config/whatsapp              — update WhatsApp config
/// </summary>
public sealed class Settings : EndpointGroupBase
{
    /// <summary>Route prefix: /auth.</summary>
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Org Settings ──────────────────────────────────────────────────────
        groupBuilder.MapGet("/org/settings", GetOrgSettings)
            .RequireAuthorization()
            .WithSummary("Return the current organization's self-service settings.");

        groupBuilder.MapMethods("/org/settings", ["PATCH"], PatchOrgSettings)
            .RequireAuthorization()
            .WithSummary("Update mutable organization settings (address, logo URL).");

        // ── Feature Flags ─────────────────────────────────────────────────────
        groupBuilder.MapGet("/feature-flags", GetFeatureFlags)
            .RequireAuthorization()
            .WithSummary("Return all platform feature flags as a key→boolean dictionary.");

        groupBuilder.MapMethods("/feature-flags/{flag}", ["PATCH"], PatchFeatureFlag)
            .RequireAuthorization()
            .WithSummary("Enable or disable a platform feature flag (upsert).");

        // ── Language Config ───────────────────────────────────────────────────
        groupBuilder.MapGet("/config/language", GetLanguageConfig)
            .RequireAuthorization()
            .WithSummary("Return platform language / locale configuration.");

        groupBuilder.MapMethods("/config/language", ["PATCH"], PatchLanguageConfig)
            .RequireAuthorization()
            .WithSummary("Update platform language / locale configuration.");

        // ── WhatsApp Config ───────────────────────────────────────────────────
        groupBuilder.MapGet("/config/whatsapp", GetWhatsAppConfig)
            .RequireAuthorization()
            .WithSummary("Return WhatsApp Business API integration configuration.");

        groupBuilder.MapMethods("/config/whatsapp", ["PATCH"], PatchWhatsAppConfig)
            .RequireAuthorization()
            .WithSummary("Update WhatsApp Business API integration configuration.");
    }

    // ── Org Settings ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetOrgSettings(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrgSettingsQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> PatchOrgSettings(
        PatchOrgSettingsRequest req, ISender sender, CancellationToken ct)
    {
        var cmd = new UpdateOrgSettingsCommand(
            req.LogoUrl,
            req.AddressLine1,
            req.AddressLine2,
            req.City,
            req.State,
            req.Pincode);

        var result = await sender.Send(cmd, ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── Feature Flags ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetFeatureFlags(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetFeatureFlagsQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> PatchFeatureFlag(
        string flag, FeatureFlagPatchRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SetFeatureFlagCommand(flag, req.Enabled), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── Platform Config (language / whatsapp) ─────────────────────────────────────

    private static async Task<IResult> GetLanguageConfig(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetPlatformConfigQuery("language"), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> PatchLanguageConfig(
        JsonElement body, ISender sender, CancellationToken ct)
    {
        var json = body.GetRawText();
        var result = await sender.Send(new UpdatePlatformConfigCommand("language", json), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> GetWhatsAppConfig(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetPlatformConfigQuery("whatsapp"), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> PatchWhatsAppConfig(
        JsonElement body, ISender sender, CancellationToken ct)
    {
        var json = body.GetRawText();
        var result = await sender.Send(new UpdatePlatformConfigCommand("whatsapp", json), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── Shared error mapper ───────────────────────────────────────────────────────

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound   => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Forbidden  => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        _                    => Results.Problem(error.Message),
    };
}

// ── Request DTOs ─────────────────────────────────────────────────────────────────

/// <summary>Body for PATCH /auth/org/settings. All fields are optional (null = keep existing).</summary>
public sealed record PatchOrgSettingsRequest(
    string? LogoUrl = null,
    string? AddressLine1 = null,
    string? AddressLine2 = null,
    string? City = null,
    string? State = null,
    string? Pincode = null);

/// <summary>Body for PATCH /auth/feature-flags/{flag}.</summary>
public sealed record FeatureFlagPatchRequest(bool Enabled);
