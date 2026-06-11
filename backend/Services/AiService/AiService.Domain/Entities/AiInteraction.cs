using SnapAccount.Shared.Domain;

namespace AiService.Domain.Entities;

/// <summary>
/// Audit record for every AI interaction (extraction or chat).
/// Persisted for compliance, token budget enforcement, and billing attribution.
/// </summary>
public sealed class AiInteraction : BaseAuditableEntity
{
    /// <summary>Organisation context — nullable for admin/cross-org calls.</summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>Requesting user (Firebase UID).</summary>
    public string UserId { get; private set; } = string.Empty;

    /// <summary>Feature code driving the interaction (e.g. "invoice_extract", "chat_qa").</summary>
    public string FeatureCode { get; private set; } = string.Empty;

    /// <summary>Provider used (e.g. "vertex", "sarvam", "mock").</summary>
    public string Provider { get; private set; } = string.Empty;

    /// <summary>Model used (e.g. "gemini-2.0-flash", "text-embedding-005").</summary>
    public string Model { get; private set; } = string.Empty;

    /// <summary>Prompt tokens consumed.</summary>
    public int InputTokens { get; private set; }

    /// <summary>Completion tokens produced.</summary>
    public int OutputTokens { get; private set; }

    /// <summary>Wall-clock latency in milliseconds.</summary>
    public int LatencyMs { get; private set; }

    /// <summary>Whether the daily token budget was exceeded for the org at the time of this call.</summary>
    public bool BudgetExceeded { get; private set; }

    // EF Core constructor
    private AiInteraction() { }

    /// <summary>Records a completed AI interaction.</summary>
    public static AiInteraction Record(
        Guid? organizationId,
        string userId,
        string featureCode,
        string provider,
        string model,
        int inputTokens,
        int outputTokens,
        int latencyMs,
        bool budgetExceeded = false)
    {
        return new AiInteraction
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            FeatureCode = featureCode,
            Provider = provider,
            Model = model,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            LatencyMs = latencyMs,
            BudgetExceeded = budgetExceeded,
        };
    }
}
