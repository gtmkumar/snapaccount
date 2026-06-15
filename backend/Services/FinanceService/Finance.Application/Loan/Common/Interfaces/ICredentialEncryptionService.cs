namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// P6-HANDOFF-27: Encryption/decryption service for partner bank API credentials.
/// Uses AES-GCM envelope encryption. Key references point to GCP Secret Manager entries.
///
/// This interface is deliberately separate from IPanEncryptionService (which is PAN-specific
/// and uses a different key hierarchy). Bank credentials use per-bank KMS references.
/// </summary>
public interface ICredentialEncryptionService
{
    /// <summary>
    /// Encrypts plain-text JSON API configuration using AES-GCM.
    /// </summary>
    /// <param name="plaintext">JSON string of bank API configuration.</param>
    /// <param name="keyRef">GCP Secret Manager key reference (e.g. "partner-bank-creds-{bankId}").</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>AES-GCM encrypted ciphertext bytes.</returns>
    Task<byte[]> EncryptAsync(string plaintext, string keyRef, CancellationToken ct = default);

    /// <summary>
    /// Decrypts AES-GCM encrypted API configuration bytes.
    /// </summary>
    /// <param name="ciphertext">Encrypted bytes from the database.</param>
    /// <param name="keyRef">GCP Secret Manager key reference matching the encryption key.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Plain-text JSON string of bank API configuration.</returns>
    Task<string> DecryptAsync(byte[] ciphertext, string keyRef, CancellationToken ct = default);

    /// <summary>
    /// Retrieves a webhook HMAC secret from GCP Secret Manager.
    /// </summary>
    /// <param name="webhookSecretRef">GCP Secret Manager reference (e.g. "partner-bank-webhook-secret-{bankId}").</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Raw HMAC secret bytes.</returns>
    Task<byte[]> GetWebhookSecretAsync(string webhookSecretRef, CancellationToken ct = default);
}
