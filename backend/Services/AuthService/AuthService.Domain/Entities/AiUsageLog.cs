using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// One metered AI/LLM call (append-only ledger). Written by any service after calling a provider
/// (OCR, chat, classification, …). Aggregated for the admin "AI usage" metrics (calls/cost/latency).
/// </summary>
public class AiUsageLog : BaseAuditableEntity
{
    public Guid? OrganizationId { get; private set; }
    public string Provider { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public string Feature { get; private set; } = string.Empty; // ocr | chat | classify | tax-advice | ...
    public int InputTokens { get; private set; }
    public int OutputTokens { get; private set; }
    public int Units { get; private set; }       // e.g. pages (for per-page billed providers)
    public int LatencyMs { get; private set; }
    public decimal CostUsd { get; private set; }

    private AiUsageLog() { }

    public static AiUsageLog Create(Guid? orgId, string provider, string model, string feature,
        int inputTokens, int outputTokens, int units, int latencyMs, decimal costUsd) => new()
    {
        OrganizationId = orgId,
        Provider = provider.Trim().ToLowerInvariant(),
        Model = model.Trim(),
        Feature = feature.Trim().ToLowerInvariant(),
        InputTokens = inputTokens,
        OutputTokens = outputTokens,
        Units = units,
        LatencyMs = latencyMs,
        CostUsd = costUsd,
    };
}
