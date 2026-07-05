namespace AuthService.Application.Privacy.Common;

/// <summary>
/// Single source of truth for the DPDP consent purpose-code taxonomy (GAP-DPDP-CONSENT-02).
///
/// The vocabulary is dot-separated lowercase (e.g. <c>marketing.sms</c>). Grant, withdraw,
/// and read all reference these constants so the three paths can never drift apart, and the
/// documented contract (docs/api/endpoints.md) mirrors this list exactly.
///
/// A previous mismatch documented UPPER_SNAKE codes (<c>MARKETING</c>, <c>ANALYTICS</c>, …)
/// while the validator/handler enforced dot-lowercase — a client following the doc got a 400.
/// This type resolves that: the code is authoritative and the doc was corrected to match.
/// </summary>
public static class ConsentPurposes
{
    /// <summary>
    /// Regex a purpose code must match: dot-separated lowercase segments, each starting
    /// with a letter (e.g. <c>marketing.sms</c>, <c>loan.creditbureau</c>).
    /// </summary>
    public const string CodePattern = @"^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$";

    /// <summary>Human-readable description per known purpose code (case-insensitive lookup).</summary>
    public static readonly IReadOnlyDictionary<string, string> Descriptions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["marketing.sms"]          = "SMS marketing messages about new features and offers.",
            ["analytics.usage"]        = "Platform usage analytics to improve the product.",
            ["data.sharing.partner"]   = "Sharing your data with authorised partner service providers.",
            ["loan.creditbureau"]      = "Sharing your credit information with credit bureaus for loan assessment.",
            ["communication.whatsapp"] = "WhatsApp messages for transactional and service communications.",
            ["communication.email"]    = "Email communications for platform updates and alerts.",
        };

    /// <summary>
    /// Returns the known description for a purpose, or the purpose code itself when the code
    /// is well-formed but not one of the predefined purposes.
    /// </summary>
    public static string DescriptionFor(string purpose)
        => Descriptions.GetValueOrDefault(purpose, purpose);
}
