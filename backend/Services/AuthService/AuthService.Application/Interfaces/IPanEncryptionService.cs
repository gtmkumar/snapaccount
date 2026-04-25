namespace AuthService.Application.Interfaces;

/// <summary>
/// SEC-013: Provides AES-256 encryption/decryption for PAN numbers (Permanent Account Number).
/// PAN is classified as sensitive PII under DPDP Act 2023 and must not be stored in plaintext.
/// The encryption key is loaded from GCP Secret Manager via the PAN_ENCRYPTION_KEY env var.
/// </summary>
public interface IPanEncryptionService
{
    /// <summary>
    /// Encrypts a plaintext PAN number.
    /// Returns Base64-encoded ciphertext (IV prepended).
    /// </summary>
    /// <param name="pan">Plaintext PAN in format XXXXX9999X.</param>
    /// <returns>Base64-encoded encrypted value suitable for database storage.</returns>
    string Encrypt(string pan);

    /// <summary>
    /// Decrypts an encrypted PAN value back to plaintext.
    /// </summary>
    /// <param name="encryptedPan">Base64-encoded ciphertext returned by <see cref="Encrypt"/>.</param>
    /// <returns>Plaintext PAN number.</returns>
    string Decrypt(string encryptedPan);
}
