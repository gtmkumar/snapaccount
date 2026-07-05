namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Resolves which <see cref="IAiProvider"/> to use for a given feature code.
/// Reads the platform AI config from AuthService (<c>GET /auth/config/ai/effective</c>)
/// and applies per-feature model overrides (migration 048 table).
/// Falls back to <c>MockAiProvider</c> when no API key is present or the HTTP call fails.
/// </summary>
public interface IAiProviderResolver
{
    /// <summary>
    /// Returns the resolved provider + effective model for <paramref name="featureCode"/>.
    /// Never throws — falls back to mock on any error.
    /// </summary>
    Task<ResolvedProvider> ResolveAsync(string featureCode, string? locale = null, CancellationToken ct = default);
}

/// <summary>Resolved provider with the effective model to use.</summary>
/// <param name="Provider">The chosen provider implementation.</param>
/// <param name="EffectiveModel">The model that should be passed to the provider.</param>
public record ResolvedProvider(IAiProvider Provider, string EffectiveModel);
