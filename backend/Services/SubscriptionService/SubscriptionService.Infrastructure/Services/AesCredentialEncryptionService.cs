using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Infrastructure.Services;

/// <summary>
/// AES-256-GCM symmetric encryption for Razorpay API credential storage.
/// Key loaded from <c>ENCRYPTION_KEY</c> env var (base64-encoded 32-byte key)
/// or <c>Subscription:EncryptionKey</c> config. Falls back to a dev-only insecure
/// placeholder that fails loudly when not set in production.
/// </summary>
public sealed class AesCredentialEncryptionService : ICredentialEncryptionService
{
    private readonly byte[] _key;

    public AesCredentialEncryptionService(IConfiguration configuration)
    {
        var rawKey = configuration["ENCRYPTION_KEY"]
            ?? configuration["Subscription:EncryptionKey"]
            ?? Environment.GetEnvironmentVariable("ENCRYPTION_KEY");

        if (string.IsNullOrWhiteSpace(rawKey))
            throw new InvalidOperationException(
                "ENCRYPTION_KEY must be set (base64-encoded 32-byte AES-256 key). " +
                "Run: openssl rand -base64 32 | base64 and set as ENCRYPTION_KEY.");

        _key = Convert.FromBase64String(rawKey);
        if (_key.Length != 32)
            throw new InvalidOperationException(
                $"ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM. Got {_key.Length}.");
    }

    /// <inheritdoc />
    public string Encrypt(string plaintext)
    {
        var nonce      = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var plaintextB = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plaintextB.Length];
        var tag        = new byte[AesGcm.TagByteSizes.MaxSize];

        using var aes = new AesGcm(_key, AesGcm.TagByteSizes.MaxSize);
        aes.Encrypt(nonce, plaintextB, ciphertext, tag);

        // Format: base64(nonce || tag || ciphertext)
        var result = new byte[nonce.Length + tag.Length + ciphertext.Length];
        nonce.CopyTo(result, 0);
        tag.CopyTo(result, nonce.Length);
        ciphertext.CopyTo(result, nonce.Length + tag.Length);

        return Convert.ToBase64String(result);
    }

    /// <inheritdoc />
    public string Decrypt(string ciphertext64)
    {
        var raw    = Convert.FromBase64String(ciphertext64);
        var nonce  = raw[..AesGcm.NonceByteSizes.MaxSize];
        var tag    = raw[AesGcm.NonceByteSizes.MaxSize..(AesGcm.NonceByteSizes.MaxSize + AesGcm.TagByteSizes.MaxSize)];
        var cipher = raw[(AesGcm.NonceByteSizes.MaxSize + AesGcm.TagByteSizes.MaxSize)..];
        var plain  = new byte[cipher.Length];

        using var aes = new AesGcm(_key, AesGcm.TagByteSizes.MaxSize);
        aes.Decrypt(nonce, cipher, tag, plain);

        return Encoding.UTF8.GetString(plain);
    }
}
