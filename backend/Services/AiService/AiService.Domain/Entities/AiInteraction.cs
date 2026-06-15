using SnapAccount.Shared.Domain;

namespace AiService.Domain.Entities;

/// <summary>
/// Audit record for every AI interaction (extraction or chat).
/// Persisted for compliance, token budget enforcement, and billing attribution.
///
/// RV-03 (SEC-AI-02): Rows may be in one of two states:
/// <list type="bullet">
///   <item><c>IsReservation = true</c> — placeholder written INSIDE the advisory-lock transaction
///         before the AI provider call. The daily-budget SUM query counts these at their estimated
///         token cost so concurrent requests see each other's pending consumption. The reservation
///         row is updated to <c>IsReservation = false</c> with actual tokens after the call
///         completes (or zeroed out and left with <c>IsReservation = false</c> on provider failure,
///         so failed calls do not permanently consume budget).</item>
///   <item><c>IsReservation = false</c> — finalised record written after the AI call completes.
///         This is the normal audit state.</item>
/// </list>
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

    /// <summary>Prompt tokens consumed (estimated before call; actual after finalisation).</summary>
    public int InputTokens { get; private set; }

    /// <summary>Completion tokens produced (0 while reserved; actual after finalisation).</summary>
    public int OutputTokens { get; private set; }

    /// <summary>Wall-clock latency in milliseconds.</summary>
    public int LatencyMs { get; private set; }

    /// <summary>Whether the daily token budget was exceeded for the org at the time of this call.</summary>
    public bool BudgetExceeded { get; private set; }

    /// <summary>
    /// RV-03 (SEC-AI-02): True when this row is a budget reservation placeholder inserted BEFORE
    /// the AI provider call. The row is finalised (set to false) once the provider call returns.
    /// The daily-sum budget query must include reservation rows so concurrent requests observe
    /// each other's in-progress consumption.
    /// </summary>
    public bool IsReservation { get; private set; }

    // EF Core constructor
    private AiInteraction() { }

    /// <summary>
    /// Creates a budget reservation placeholder. Written INSIDE the advisory-lock transaction
    /// before the AI provider is called. The daily-budget SUM must include these rows.
    /// </summary>
    public static AiInteraction Reserve(
        Guid? organizationId,
        string userId,
        string featureCode,
        int estimatedInputTokens)
    {
        return new AiInteraction
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            FeatureCode = featureCode,
            Provider = "pending",
            Model = "pending",
            InputTokens = estimatedInputTokens,
            OutputTokens = 0,
            LatencyMs = 0,
            BudgetExceeded = false,
            IsReservation = true,
        };
    }

    /// <summary>
    /// Finalises the reservation row with actual provider results.
    /// Called after the AI provider call completes successfully.
    /// </summary>
    public void Finalise(string provider, string model, int inputTokens, int outputTokens, int latencyMs)
    {
        Provider = provider;
        Model = model;
        InputTokens = inputTokens;
        OutputTokens = outputTokens;
        LatencyMs = latencyMs;
        IsReservation = false;
    }

    /// <summary>
    /// Zeroes out a reservation after a provider failure so the failed call
    /// does not permanently consume budget. The row remains for audit purposes.
    /// </summary>
    public void MarkFailed(string reason)
    {
        Provider = "failed";
        Model = reason.Length > 64 ? reason[..64] : reason;
        InputTokens = 0;
        OutputTokens = 0;
        IsReservation = false;
        BudgetExceeded = false;
    }

    /// <summary>Records a completed AI interaction (non-reservation path — e.g. budget-exceeded audit).</summary>
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
            IsReservation = false,
        };
    }
}
