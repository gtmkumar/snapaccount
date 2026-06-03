namespace AuthService.Application.Interfaces;

/// <summary>
/// Generic AES-256-CBC encryption service for sensitive fields stored at rest.
/// Used by TOTP enrollment to encrypt the TOTP shared secret before persisting it.
/// Key is sourced from <c>ENCRYPTION_KEY</c> (base64 32 bytes) via env var or config —
/// never hardcoded. For local dev without a key configured, a deterministic dev key is
/// derived with a warning (mirrors the <c>AesAiKeyProtector</c> dev-fallback pattern).
/// </summary>
public interface IEncryptionService
{
    /// <summary>Encrypts <paramref name="plaintext"/> and returns Base64( IV(16) || ciphertext ).</summary>
    string Encrypt(string plaintext);

    /// <summary>Decrypts a value previously produced by <see cref="Encrypt"/>.</summary>
    string Decrypt(string ciphertext);
}
