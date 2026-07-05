namespace ItrService.Application.Common.Interfaces;

/// <summary>
/// SEC-041: Server-side AES-256-CBC encryption for PAN numbers in ItrService.
/// Mirrors AuthService.Application.Interfaces.IPanEncryptionService — kept per-service
/// to preserve Clean Architecture boundaries (services do not reference each other's
/// Application layers).
/// </summary>
public interface IPanEncryptionService
{
    /// <summary>Encrypts a plaintext PAN. Returns Base64( IV[16] || Ciphertext ).</summary>
    string Encrypt(string pan);

    /// <summary>Decrypts a Base64-encoded PAN ciphertext back to plaintext.</summary>
    string Decrypt(string encryptedPan);
}
