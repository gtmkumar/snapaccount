using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Partner bank entity.
/// P6-HANDOFF-27: api_config_encrypted is AES-GCM envelope; decryption via ICredentialEncryptionService.
/// api_config_key_ref and webhook_secret_ref are GCP Secret Manager references.
/// </summary>
public class PartnerBank : BaseAuditableEntity
{
    /// <summary>Short display name (e.g. "ICICI Bank").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>GCS URI or CDN URL for the bank logo image.</summary>
    public string? LogoUrl { get; set; }

    /// <summary>Adapter type that determines how applications are submitted.</summary>
    public BankAdapterType AdapterType { get; set; } = BankAdapterType.Email;

    /// <summary>Primary contact email for EmailPartnerBankAdapter submissions.</summary>
    public string? ContactEmail { get; set; }

    /// <summary>AES-GCM encrypted API configuration JSON (for RestPartnerBankAdapter).</summary>
    public byte[]? ApiConfigEncrypted { get; set; }

    /// <summary>GCP Secret Manager key reference for decrypting ApiConfigEncrypted.</summary>
    public string? ApiConfigKeyRef { get; set; }

    /// <summary>GCP Secret Manager reference for the per-bank webhook HMAC secret.</summary>
    public string? WebhookSecretRef { get; set; }

    /// <summary>Whether this bank is currently accepting applications.</summary>
    public bool IsActive { get; set; } = true;
}

/// <summary>Supported bank adapter integration types.</summary>
public enum BankAdapterType
{
    /// <summary>Sends PDF package via email (contact email required).</summary>
    Email,
    /// <summary>Generic REST POST with OAuth2 client-credentials.</summary>
    Rest,
    /// <summary>OAuth2 flow with bank portal.</summary>
    OAuth
}
