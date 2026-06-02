using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Queries.GetEffectiveAiConfig;

/// <summary>
/// Service-to-service: returns the resolved provider/model/tier AND the DECRYPTED API key for
/// the active OCR provider (or the requested override). Consumed by DocumentService to pick and
/// call the right OCR engine. Authenticated callers only; the key never leaves the backend network.
/// </summary>
public record GetEffectiveAiConfigQuery(string? Provider = null) : IQuery<EffectiveAiConfigDto>;

public record EffectiveAiConfigDto(
    string Provider,
    string? Model,
    string Tier,
    decimal ConfidenceThreshold,
    bool OcrEnabled,
    bool AutoClassifyEnabled,
    string? ApiKey);

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

        return new EffectiveAiConfigDto(
            provider, cfg.OcrModel, cfg.OcrTier, cfg.ConfidenceThreshold,
            cfg.OcrEnabled, cfg.AutoClassifyEnabled, apiKey);
    }
}
