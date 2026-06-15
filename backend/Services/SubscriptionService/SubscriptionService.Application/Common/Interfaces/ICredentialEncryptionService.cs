namespace SubscriptionService.Application.Common.Interfaces;

/// <summary>
/// Simple symmetric encryption service for Razorpay credential storage.
/// Uses AES-256-GCM keyed from the <c>ENCRYPTION_KEY</c> env var / Secret Manager.
/// Distinct from LoanService's ICredentialEncryptionService which is per-key KMS.
/// </summary>
public interface ICredentialEncryptionService
{
    /// <summary>Encrypts plaintext and returns a base64-encoded ciphertext.</summary>
    string Encrypt(string plaintext);

    /// <summary>Decrypts a base64-encoded ciphertext and returns plaintext.</summary>
    string Decrypt(string ciphertext);
}
