using AuthService.Application.AiConfig.Queries.GetAiConfig;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Commands.UpdateAiConfig;

/// <summary>
/// Updates the platform AI config and (optionally) sets provider API keys. Keys in
/// <see cref="ProviderKeys"/> are raw plaintext on the way in, encrypted before storage, and
/// never echoed back. Super Admin only (platform.ai.manage).
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformAiManage)]
public record UpdateAiConfigCommand(
    string? Provider,
    string? ModelId,
    string? OcrTier,
    decimal? ConfidenceThreshold,
    bool? OcrEnabled,
    bool? AutoClassifyEnabled,
    Dictionary<string, string>? ProviderKeys) : ICommand<AiConfigDto>;

public sealed class UpdateAiConfigCommandHandler(
    IAuthDbContext db,
    IAiKeyProtector protector) : ICommandHandler<UpdateAiConfigCommand, AiConfigDto>
{
    public async Task<Result<AiConfigDto>> Handle(UpdateAiConfigCommand request, CancellationToken ct)
    {
        var cfg = await db.AiConfigurations
            .FirstOrDefaultAsync(c => c.Id == AiConfiguration.SingletonId, ct);
        if (cfg is null)
        {
            cfg = AiConfiguration.CreateDefault();
            db.AiConfigurations.Add(cfg);
        }

        cfg.Update(request.Provider, request.ModelId, request.OcrTier,
            request.ConfidenceThreshold, request.OcrEnabled, request.AutoClassifyEnabled);

        // Upsert any supplied provider keys (skip empty values — those mean "leave unchanged").
        if (request.ProviderKeys is { Count: > 0 })
        {
            var existing = await db.AiProviderKeys
                .Where(k => k.DeletedAt == null)
                .ToListAsync(ct);

            foreach (var (providerRaw, rawKey) in request.ProviderKeys)
            {
                if (string.IsNullOrWhiteSpace(rawKey)) continue;
                var provider = providerRaw.Trim().ToLowerInvariant();
                var trimmed = rawKey.Trim();
                var encrypted = protector.Encrypt(trimmed);
                var last4 = trimmed.Length >= 4 ? trimmed[^4..] : trimmed;

                var row = existing.FirstOrDefault(k => k.Provider == provider);
                if (row is null)
                    db.AiProviderKeys.Add(AiProviderKey.Create(provider, encrypted, last4));
                else
                    row.SetKey(encrypted, last4);
            }
        }

        await db.SaveChangesAsync(ct);

        var keys = await db.AiProviderKeys.AsNoTracking()
            .Where(k => k.DeletedAt == null)
            .Select(k => new ProviderKeyStatusDto(k.Provider, k.EncryptedKey != "", k.KeyLast4))
            .ToListAsync(ct);

        return new AiConfigDto(cfg.OcrProvider, cfg.OcrModel, cfg.OcrTier, cfg.ConfidenceThreshold,
            cfg.OcrEnabled, cfg.AutoClassifyEnabled, keys);
    }
}
