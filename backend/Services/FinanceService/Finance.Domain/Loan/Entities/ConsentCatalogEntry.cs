using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// SEC-050 / P6-HANDOFF-25: A versioned consent text catalog entry.
/// Mobile fetches GET /loans/consents/catalog before showing the consent
/// screen; the returned <see cref="TextVersion"/> is then echoed back in
/// <see cref="Consent.ConsentTextVersion"/> on RecordConsent so DPDP audit
/// rows tie back to the exact text the user saw.
/// </summary>
public class ConsentCatalogEntry : BaseAuditableEntity
{
    /// <summary>Consent type code (CREDIT_BUREAU, DATA_SHARE_WITH_BANK, DISBURSEMENT_MANDATE).</summary>
    public string ConsentType { get; private set; } = string.Empty;

    /// <summary>Current text version label (e.g. "1.4").</summary>
    public string TextVersion { get; private set; } = string.Empty;

    /// <summary>Locale code (e.g. "en", "hi"). One row per (type, version, locale).</summary>
    public string Locale { get; private set; } = "en";

    /// <summary>Human-readable consent body (markdown).</summary>
    public string BodyMd { get; private set; } = string.Empty;

    /// <summary>UTC date the version became effective.</summary>
    public DateTime EffectiveFrom { get; private set; }

    /// <summary>UTC date the version was retired (NULL = current).</summary>
    public DateTime? RetiredAt { get; private set; }

    private ConsentCatalogEntry() { }

    public static ConsentCatalogEntry Create(
        string consentType, string textVersion, string locale,
        string bodyMd, DateTime effectiveFrom)
        => new()
        {
            ConsentType = consentType,
            TextVersion = textVersion,
            Locale = locale,
            BodyMd = bodyMd,
            EffectiveFrom = effectiveFrom,
        };

    public void Retire(DateTime at) => RetiredAt = at;
}
