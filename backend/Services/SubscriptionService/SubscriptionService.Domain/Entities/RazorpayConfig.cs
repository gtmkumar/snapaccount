using SnapAccount.Shared.Domain;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// Admin-configured Razorpay credentials (single row per service instance).
///
/// The secret key is stored encrypted (AES-256-GCM via ICredentialEncryptionService).
/// Only the key_id is stored in plaintext; the key_secret is encrypted at rest.
///
/// Test mode: when <see cref="TestMode"/> is true, the Razorpay client calls the
/// test API (rzp_test_*) and does NOT charge real money.
/// </summary>
public class RazorpayConfig : BaseAuditableEntity
{
    /// <summary>Razorpay API key ID (starts with rzp_live_ or rzp_test_).</summary>
    public string KeyId { get; set; } = string.Empty;

    /// <summary>Razorpay API key secret — stored encrypted.</summary>
    public string EncryptedKeySecret { get; set; } = string.Empty;

    /// <summary>Razorpay webhook secret for HMAC verification — stored encrypted.</summary>
    public string? EncryptedWebhookSecret { get; set; }

    /// <summary>
    /// When true, the adapter uses test API keys and does not charge real money.
    /// Always true in local/staging environments.
    /// </summary>
    public bool TestMode { get; set; } = true;

    /// <summary>When false, the Razorpay integration is disabled (no payments processed).</summary>
    public bool IsEnabled { get; set; } = false;
}
