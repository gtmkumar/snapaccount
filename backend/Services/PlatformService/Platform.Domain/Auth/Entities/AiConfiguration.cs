using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Per-feature model + temperature override (e.g. use a cheaper model for document classification).
/// Stored inside <see cref="AiConfiguration.FeatureModels"/> keyed by a feature name.
/// </summary>
public record AiFeatureModel(string Model, decimal Temperature);

/// <summary>
/// Platform-wide AI configuration (a single row). Selects the active provider/model/tier for
/// AI features (OCR extraction, classification, chatbot). API keys are stored separately and
/// encrypted in <see cref="AiProviderKey"/>. Managed by Super Admin (platform.ai.manage).
/// </summary>
public class AiConfiguration : BaseAuditableEntity
{
    /// <summary>Fixed singleton row id — there is exactly one platform AI config.</summary>
    public static readonly Guid SingletonId = Guid.Parse("a1c00f16-0000-0000-0000-000000000001");

    /// <summary>Active provider: tesseract | gemini | openai | anthropic | document_ai.</summary>
    public string OcrProvider { get; private set; } = "tesseract";

    /// <summary>Concrete model id for the provider (e.g. gemini-2.0-flash, gpt-4o-mini).</summary>
    public string? OcrModel { get; private set; }

    /// <summary>Capability tier: fast | efficient | advanced.</summary>
    public string OcrTier { get; private set; } = "efficient";

    /// <summary>Minimum confidence (0..1) to auto-accept extracted fields.</summary>
    public decimal ConfidenceThreshold { get; private set; } = 0.75m;

    /// <summary>Run OCR automatically on upload.</summary>
    public bool OcrEnabled { get; private set; } = true;

    /// <summary>AI auto-classification of documents by type.</summary>
    public bool AutoClassifyEnabled { get; private set; } = true;

    /// <summary>Indian languages enabled for Sarvam AI processing (e.g. Hindi, Bengali).</summary>
    public IReadOnlyList<string> SarvamLanguages { get; private set; } = [];

    /// <summary>Per-feature model/temperature overrides keyed by feature name.</summary>
    public IReadOnlyDictionary<string, AiFeatureModel> FeatureModels { get; private set; }
        = new Dictionary<string, AiFeatureModel>();

    public void Update(string? provider, string? model, string? tier,
        decimal? confidenceThreshold, bool? ocrEnabled, bool? autoClassifyEnabled,
        IReadOnlyList<string>? sarvamLanguages = null,
        IReadOnlyDictionary<string, AiFeatureModel>? featureModels = null)
    {
        if (!string.IsNullOrWhiteSpace(provider)) OcrProvider = provider.Trim().ToLowerInvariant();
        if (model is not null) OcrModel = string.IsNullOrWhiteSpace(model) ? null : model.Trim();
        if (!string.IsNullOrWhiteSpace(tier)) OcrTier = tier.Trim().ToLowerInvariant();
        if (confidenceThreshold is >= 0 and <= 1) ConfidenceThreshold = confidenceThreshold.Value;
        if (ocrEnabled.HasValue) OcrEnabled = ocrEnabled.Value;
        if (autoClassifyEnabled.HasValue) AutoClassifyEnabled = autoClassifyEnabled.Value;
        if (sarvamLanguages is not null)
            SarvamLanguages = sarvamLanguages.Where(l => !string.IsNullOrWhiteSpace(l)).Distinct().ToList();
        if (featureModels is not null)
            FeatureModels = new Dictionary<string, AiFeatureModel>(featureModels);
    }

    public static AiConfiguration CreateDefault() => new() { Id = SingletonId };
}
