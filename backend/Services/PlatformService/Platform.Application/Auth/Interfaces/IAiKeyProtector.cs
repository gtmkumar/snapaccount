namespace AuthService.Application.Interfaces;

/// <summary>
/// Encrypts/decrypts AI provider API keys at rest (AES-256). Mirrors the PAN encryption
/// approach (SEC-013). Keys are stored encrypted and never returned in plaintext to clients.
/// </summary>
public interface IAiKeyProtector
{
    string Encrypt(string plaintext);
    string Decrypt(string ciphertext);
}
