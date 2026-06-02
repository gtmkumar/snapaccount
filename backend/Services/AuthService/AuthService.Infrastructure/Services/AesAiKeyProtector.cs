using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// AES-256-CBC protector for AI provider API keys (SEC-013 pattern). The 256-bit key comes from
/// config <c>Ai:KeyEncryptionKey</c> (base64, 32 bytes) — set via GCP Secret Manager in prod.
/// For local dev, if that key is absent, a deterministic dev key is derived (with a loud warning)
/// so the encrypt/decrypt round-trips without setup. NEVER rely on the dev fallback in production.
/// Stored format: Base64( IV(16) || ciphertext ).
/// </summary>
public sealed class AesAiKeyProtector : IAiKeyProtector
{
    private readonly byte[] _key;

    public AesAiKeyProtector(IConfiguration configuration, ILogger<AesAiKeyProtector> logger)
    {
        var b64 = configuration["Ai:KeyEncryptionKey"];
        if (!string.IsNullOrWhiteSpace(b64))
        {
            _key = Convert.FromBase64String(b64);
            if (_key.Length != 32)
                throw new InvalidOperationException($"Ai:KeyEncryptionKey must be 256-bit (32 bytes); got {_key.Length}.");
        }
        else
        {
            // DEV ONLY: derive a stable 32-byte key from a fixed dev seed so local dev works
            // without configuring a secret. Loud warning so this is never mistaken for prod-safe.
            logger.LogWarning(
                "Ai:KeyEncryptionKey not configured — using an INSECURE derived dev key to encrypt AI provider keys. " +
                "Set Ai:KeyEncryptionKey (base64 32 bytes) in staging/production.");
            _key = SHA256.HashData(Encoding.UTF8.GetBytes("snapaccount-local-dev-ai-key-protector-v1"));
        }
    }

    public string Encrypt(string plaintext)
    {
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.GenerateIV();

        using var enc = aes.CreateEncryptor();
        var plain = Encoding.UTF8.GetBytes(plaintext);
        var cipher = enc.TransformFinalBlock(plain, 0, plain.Length);

        var result = new byte[aes.IV.Length + cipher.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipher, 0, result, aes.IV.Length, cipher.Length);
        return Convert.ToBase64String(result);
    }

    public string Decrypt(string ciphertext)
    {
        var all = Convert.FromBase64String(ciphertext);
        var iv = all[..16];
        var cipher = all[16..];

        using var aes = Aes.Create();
        aes.Key = _key;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        using var dec = aes.CreateDecryptor();
        var plain = dec.TransformFinalBlock(cipher, 0, cipher.Length);
        return Encoding.UTF8.GetString(plain);
    }
}
