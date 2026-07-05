using SnapAccount.Shared.Domain;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// A subscription plan available for organisations to subscribe to.
/// Admin-managed; tier and pricing are configurable.
/// </summary>
public class Plan : BaseAuditableEntity
{
    /// <summary>
    /// Stable machine code (e.g. "FREE", "BASIC"). subscription_plan.code is NOT NULL UNIQUE
    /// (migration 010) — BUG-SUB-PLAN-CODE-MISSING: this was never mapped, so every insert 500'd.
    /// </summary>
    public string Code { get; private set; } = string.Empty;

    /// <summary>Plan display name (e.g. "Starter Monthly").</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Feature tier for gate enforcement.</summary>
    public PlanTier Tier { get; private set; }

    /// <summary>Billing frequency.</summary>
    public BillingCycle BillingCycle { get; private set; }

    /// <summary>Price in INR (paise — multiply by 100 for Razorpay).</summary>
    public decimal PriceInr { get; private set; }

    /// <summary>Trial period in days (0 = no trial).</summary>
    public int TrialDays { get; private set; }

    /// <summary>Whether this plan is currently offered to new subscribers.</summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>Optional description / feature list (markdown).</summary>
    public string? Description { get; private set; }

    /// <summary>
    /// Razorpay plan ID (rplan_*) — populated after SyncPlanAsync succeeds.
    /// Null when Razorpay integration is disabled or the plan has not been synced yet.
    /// </summary>
    public string? RazorpayPlanId { get; private set; }

    private Plan() { }

    /// <summary>Creates a new plan.</summary>
    /// <remarks>
    /// BUG-SUB-PLAN-CODE-MISSING: <paramref name="code"/> is trailing-optional to preserve existing
    /// call sites; the CreatePlanCommandHandler always supplies a non-empty, unique code (the DB
    /// column is NOT NULL UNIQUE). When empty, a slug is derived from the name.
    /// </remarks>
    public static Plan Create(
        string name,
        PlanTier tier,
        BillingCycle billingCycle,
        decimal priceInr,
        int trialDays = 0,
        string? description = null,
        string code = "")
        => new()
        {
            Name = name,
            Code = string.IsNullOrWhiteSpace(code) ? DeriveCode(name) : code,
            Tier = tier,
            BillingCycle = billingCycle,
            PriceInr = priceInr,
            TrialDays = trialDays,
            Description = description,
            IsActive = true
        };

    /// <summary>Updates mutable plan fields (admin operation).</summary>
    public void Update(string name, decimal priceInr, string? description, bool isActive)
    {
        Name = name;
        PriceInr = priceInr;
        Description = description;
        IsActive = isActive;
    }

    /// <summary>
    /// Records the Razorpay plan ID after a successful SyncPlanAsync call.
    /// Called from CreatePlanCommandHandler when Razorpay integration is enabled.
    /// </summary>
    public void SetRazorpayPlanId(string razorpayPlanId)
        => RazorpayPlanId = razorpayPlanId;

    /// <summary>
    /// Derives a stable machine code from a display name (UPPER_SNAKE, alphanumerics only, ≤50 chars).
    /// Fallback used when no explicit code is supplied; the create handler supplies a uniqueness suffix.
    /// </summary>
    public static string DeriveCode(string name)
    {
        var chars = (name ?? string.Empty).Trim().ToUpperInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '_')
            .ToArray();
        var slug = new string(chars);
        while (slug.Contains("__")) slug = slug.Replace("__", "_");
        slug = slug.Trim('_');
        if (slug.Length == 0) slug = "PLAN";
        return slug.Length > 50 ? slug[..50] : slug;
    }
}
