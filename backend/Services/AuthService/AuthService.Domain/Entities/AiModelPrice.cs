using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Maintained price catalog entry for one provider/model. Cost is computed from real usage as
/// (input_tokens/1e6 * input_per_million) + (output_tokens/1e6 * output_per_million) + (units * per_page).
/// Rates are editable by Super Admin (there is no live LLM market-price feed). Free/local engines
/// (e.g. Tesseract) have all-zero rates.
/// </summary>
public class AiModelPrice : BaseAuditableEntity
{
    public string Provider { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public decimal InputPerMillion { get; private set; }   // USD per 1M input tokens
    public decimal OutputPerMillion { get; private set; }  // USD per 1M output tokens
    public decimal PerPage { get; private set; }           // USD per page (e.g. Document AI)
    public string Currency { get; private set; } = "USD";
    public bool IsActive { get; private set; } = true;

    private AiModelPrice() { }

    public static AiModelPrice Create(string provider, string model,
        decimal inputPerMillion, decimal outputPerMillion, decimal perPage) => new()
    {
        Provider = provider.Trim().ToLowerInvariant(),
        Model = model.Trim(),
        InputPerMillion = inputPerMillion,
        OutputPerMillion = outputPerMillion,
        PerPage = perPage,
    };

    public void UpdateRates(decimal? inputPerMillion, decimal? outputPerMillion, decimal? perPage, bool? isActive)
    {
        if (inputPerMillion is >= 0) InputPerMillion = inputPerMillion.Value;
        if (outputPerMillion is >= 0) OutputPerMillion = outputPerMillion.Value;
        if (perPage is >= 0) PerPage = perPage.Value;
        if (isActive.HasValue) IsActive = isActive.Value;
    }

    /// <summary>Compute the USD cost of one call given its measured usage.</summary>
    public decimal CostFor(int inputTokens, int outputTokens, int units)
        => inputTokens / 1_000_000m * InputPerMillion
         + outputTokens / 1_000_000m * OutputPerMillion
         + units * PerPage;
}
