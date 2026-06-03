using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// AES-256-CBC encryption service for TOTP secrets and other sensitive fields stored at rest.
/// Key source (in priority order):
///   1. Config key <c>ENCRYPTION_KEY</c> (base64-encoded 32 bytes) — set via GCP Secret Manager in prod.
///   2. Dev fallback: a SHA-256 hash of a fixed seed string (loud warning logged).
///
/// Storage format: Base64( IV(16 bytes) || Ciphertext ).
/// </summary>
public sealed class AesEncryptionService : IEncryptionService
{
    private readonly byte[] _key;

    public AesEncryptionService(IConfiguration configuration, ILogger<AesEncryptionService> logger)
    {
        var b64 = configuration["ENCRYPTION_KEY"]
            ?? configuration["Encryption:Key"];

        if (!string.IsNullOrWhiteSpace(b64))
        {
            _key = Convert.FromBase64String(b64);
            if (_key.Length != 32)
                throw new InvalidOperationException(
                    $"ENCRYPTION_KEY must be base64-encoded 256-bit (32 bytes); got {_key.Length} bytes.");
        }
        else
        {
            // DEV ONLY — deterministic dev key derived from a fixed seed so encrypt/decrypt
            // round-trips without any configuration. Never use in staging/production.
            logger.LogWarning(
                "ENCRYPTION_KEY not configured — using an INSECURE derived dev key to encrypt TOTP secrets. " +
                "Set ENCRYPTION_KEY (base64 32 bytes) in GCP Secret Manager for staging/production.");
            _key = SHA256.HashData(Encoding.UTF8.GetBytes("snapaccount-local-dev-encryption-key-v1"));
        }
    }

    /// <inheritdoc />
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

    /// <inheritdoc />
    public string Decrypt(string ciphertext)
    {
        var all = Convert.FromBase64String(ciphertext);
        if (all.Length < 17)
            throw new CryptographicException("Ciphertext is too short.");

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
