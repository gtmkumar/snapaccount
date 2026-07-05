using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Queries.GetEffectiveAiConfig;

/// <summary>
/// Service-to-service: returns the resolved provider/model/tier AND the DECRYPTED API key for
/// the active AI/OCR provider (or the requested override).
///
/// <para><b>Authorization (SEC-AI-02 H-02):</b> requires <c>platform.ai.manage</c> permission.
/// This restricts the decrypted-key response to Super Admin users only. Internal service-to-service
/// callers (e.g. AiService's <c>AiProviderResolver</c>) must pass a valid <c>X-Internal-Token</c>
/// header that is checked at the endpoint level <em>before</em> this query reaches MediatR, so
/// the permission gate is bypassed only for authenticated internal traffic. See
/// <c>AiConfigEndpoints.cs</c> for the bypass implementation.</para>
/// </summary>
[RequiresPermission(Permissions.PlatformAiManage)]
public record GetEffectiveAiConfigQuery(string? Provider = null) : IQuery<EffectiveAiConfigDto>;

public record EffectiveAiConfigDto(
    string Provider,
    string? Model,
    string Tier,
    decimal ConfidenceThreshold,
    bool OcrEnabled,
    bool AutoClassifyEnabled,
    string? ApiKey,
    /// <summary>
    /// I-02 (SEC-AI-02): The configured embedding model override.
    /// AiProviderResolver uses this field to select the embedding model when calling Vertex/Gemini.
    /// Previously missing from the DTO, causing AiProviderResolver to always fall back to
    /// "text-embedding-005" regardless of the admin-configured value.
    /// </summary>
    string? EmbeddingModel = null);

public sealed class GetEffectiveAiConfigQueryHandler(
    IAuthDbContext db,
    IAiKeyProtector protector) : IQueryHandler<GetEffectiveAiConfigQuery, EffectiveAiConfigDto>
{
    public async Task<Result<EffectiveAiConfigDto>> Handle(GetEffectiveAiConfigQuery request, CancellationToken ct)
    {
        var cfg = await db.AiConfigurations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == AiConfiguration.SingletonId, ct)
            ?? AiConfiguration.CreateDefault();

        var provider = string.IsNullOrWhiteSpace(request.Provider)
            ? cfg.OcrProvider
            : request.Provider.Trim().ToLowerInvariant();

        string? apiKey = null;
        var keyRow = await db.AiProviderKeys.AsNoTracking()
            .FirstOrDefaultAsync(k => k.Provider == provider && k.DeletedAt == null, ct);
        if (keyRow is not null && !string.IsNullOrEmpty(keyRow.EncryptedKey))
        {
            try { apiKey = protector.Decrypt(keyRow.EncryptedKey); }
            catch { apiKey = null; /* corrupt/rotated key — treat as unconfigured */ }
        }

        // I-02 (SEC-AI-02): Resolve embedding model from per-feature override if present,
        // otherwise fall back to the chat/generation model. AiProviderResolver was silently
        // ignoring the configured model because EmbeddingModel was absent from the DTO.
        var embeddingModel = cfg.FeatureModels.TryGetValue("embedding", out var embedOverride)
            ? embedOverride.Model
            : null; // AiProviderResolver defaults to "text-embedding-005" when null

        return new EffectiveAiConfigDto(
            provider, cfg.OcrModel, cfg.OcrTier, cfg.ConfidenceThreshold,
            cfg.OcrEnabled, cfg.AutoClassifyEnabled, apiKey, embeddingModel);
    }
}
