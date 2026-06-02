using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Queries.GetAiConfig;

/// <summary>Reads the platform AI config + per-provider key STATUS (never the raw keys).</summary>
public record GetAiConfigQuery : IQuery<AiConfigDto>;

public record ProviderKeyStatusDto(string Provider, bool Configured, string? Last4);

/// <summary>Per-feature model/temperature override returned to the admin UI.</summary>
public record FeatureModelDto(string Model, decimal Temperature);

public record AiConfigDto(
    string Provider,
    string? ModelId,
    string OcrTier,
    decimal ConfidenceThreshold,
    bool OcrEnabled,
    bool AutoClassifyEnabled,
    IReadOnlyList<ProviderKeyStatusDto> ProviderKeys,
    IReadOnlyList<string> SarvamLanguages,
    IReadOnlyDictionary<string, FeatureModelDto> FeatureModels);

public sealed class GetAiConfigQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetAiConfigQuery, AiConfigDto>
{
    public async Task<Result<AiConfigDto>> Handle(GetAiConfigQuery request, CancellationToken ct)
    {
        var cfg = await db.AiConfigurations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == AiConfiguration.SingletonId, ct)
            ?? AiConfiguration.CreateDefault();

        var keys = await db.AiProviderKeys.AsNoTracking()
            .Where(k => k.DeletedAt == null)
            .Select(k => new ProviderKeyStatusDto(k.Provider, k.EncryptedKey != "", k.KeyLast4))
            .ToListAsync(ct);

        var featureModels = cfg.FeatureModels.ToDictionary(
            kv => kv.Key, kv => new FeatureModelDto(kv.Value.Model, kv.Value.Temperature));

        return new AiConfigDto(
            cfg.OcrProvider, cfg.OcrModel, cfg.OcrTier, cfg.ConfidenceThreshold,
            cfg.OcrEnabled, cfg.AutoClassifyEnabled, keys,
            cfg.SarvamLanguages, featureModels);
    }
}
