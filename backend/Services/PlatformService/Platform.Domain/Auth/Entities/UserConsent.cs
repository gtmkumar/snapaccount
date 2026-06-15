using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// DPDP Act 2023 / DPDP Rules 2025 — Purpose-coded consent record.
///
/// Consent is IMMUTABLE after creation — any change (grant or withdrawal) creates
/// a new row. This produces an append-only audit trail per user × purpose.
///
/// Lifecycle:
///   GRANTED   → Status = "granted",  WithdrawnAt = NULL
///   WITHDRAWN → Status = "withdrawn", WithdrawnAt = timestamp
///
/// Consumers that derive "is currently consented" MUST query the most-recent row
/// per (user_id, purpose) and check Status = 'granted'.
/// </summary>
public class UserConsent : BaseAuditableEntity
{
    /// <summary>FK to the user who granted/withdrew this consent.</summary>
    public Guid UserId { get; private set; }

    /// <summary>
    /// Processing purpose code.
    /// Examples: "marketing.sms", "analytics.usage", "data.sharing.partner",
    /// "loan.creditbureau", "communication.whatsapp".
    /// Immutable after creation.
    /// </summary>
    public string Purpose { get; private set; } = string.Empty;

    /// <summary>Human-readable description of the processing purpose.</summary>
    public string PurposeDescription { get; private set; } = string.Empty;

    /// <summary>Version of the privacy notice shown to the user. Immutable.</summary>
    public string NoticeVersion { get; private set; } = string.Empty;

    /// <summary>
    /// Current status: "granted" or "withdrawn".
    /// </summary>
    public string Status { get; private set; } = "granted";

    /// <summary>
    /// Timestamp of the original grant/withdrawal action.
    /// Immutable; set once at creation.
    /// </summary>
    public DateTime ActionAt { get; private set; }

    /// <summary>IP address of the requesting device at grant time. Immutable.</summary>
    public string? IpAddress { get; private set; }

    /// <summary>User-Agent of the requesting device at grant time. Immutable.</summary>
    public string? UserAgent { get; private set; }

    /// <summary>
    /// The locale in which the privacy notice was shown (BCP-47 tag). Immutable.
    /// </summary>
    public string Locale { get; private set; } = "en";

    /// <summary>Timestamp when this consent was withdrawn. NULL if still granted.</summary>
    public DateTime? WithdrawnAt { get; private set; }

    private UserConsent() { }

    /// <summary>Creates a new granted consent record.</summary>
    public static UserConsent Grant(
        Guid userId,
        string purpose,
        string purposeDescription,
        string noticeVersion,
        string? ipAddress,
        string? userAgent,
        string locale = "en")
        => new()
        {
            UserId = userId,
            Purpose = purpose,
            PurposeDescription = purposeDescription,
            NoticeVersion = noticeVersion,
            Status = "granted",
            ActionAt = DateTime.UtcNow,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            Locale = string.IsNullOrWhiteSpace(locale) ? "en" : locale.Trim().ToLowerInvariant(),
        };

    /// <summary>Creates a withdrawal record for a previously granted consent.</summary>
    public static UserConsent Withdraw(
        Guid userId,
        string purpose,
        string purposeDescription,
        string noticeVersion,
        string? ipAddress,
        string? userAgent,
        string locale = "en")
        => new()
        {
            UserId = userId,
            Purpose = purpose,
            PurposeDescription = purposeDescription,
            NoticeVersion = noticeVersion,
            Status = "withdrawn",
            ActionAt = DateTime.UtcNow,
            WithdrawnAt = DateTime.UtcNow,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            Locale = string.IsNullOrWhiteSpace(locale) ? "en" : locale.Trim().ToLowerInvariant(),
        };
}
