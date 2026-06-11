using System.Security.Cryptography;
using System.Text;
using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// AES-256-GCM protector for AI provider API keys. The 256-bit key comes from config
/// <c>Ai:KeyEncryptionKey</c> (base64, 32 bytes) — set via GCP Secret Manager in prod.
///
/// <para><b>Versioned ciphertext format</b> (SEC-AI-02 / H-01):</para>
/// <list type="bullet">
///   <item><c>v2</c> (GCM — new default): Base64( 0x02 || Nonce(12) || Tag(16) || Ciphertext )</item>
///   <item><c>v1</c> (CBC — legacy, read-only): Base64( IV(16) || Ciphertext ) — recognised by
///         a leading version byte that is NOT 0x02 or by payload length heuristic.</item>
/// </list>
///
/// <para>Migration: <see cref="Decrypt"/> accepts both formats transparently. All new
/// <see cref="Encrypt"/> calls write v2 (GCM). Callers should re-encrypt on first successful
/// decrypt of a v1 value to accelerate legacy ciphertext migration.</para>
///
/// <para><b>Fail-fast</b> (SEC-AI-02 / M-05): if the environment is not Development and
/// <c>Ai:KeyEncryptionKey</c> is absent, startup throws rather than silently using the dev
/// seed — matching the <c>ValidateOrThrow</c> pattern used elsewhere in the codebase.</para>
/// </summary>
public sealed class AesAiKeyProtector : IAiKeyProtector
{
    // Version byte written at the front of every v2 (GCM) ciphertext.
    private const byte GcmVersionByte = 0x02;
    private const int GcmNonceSize = 12;
    private const int GcmTagSize = 16;

    private readonly byte[] _key;

    public AesAiKeyProtector(
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<AesAiKeyProtector> logger)
    {
        var b64 = configuration["Ai:KeyEncryptionKey"];
        if (!string.IsNullOrWhiteSpace(b64))
        {
            _key = Convert.FromBase64String(b64);
            if (_key.Length != 32)
                throw new InvalidOperationException(
                    $"Ai:KeyEncryptionKey must be 256-bit (32 bytes); got {_key.Length}.");
        }
        else if (environment.IsDevelopment())
        {
            // DEV ONLY: derive a stable 32-byte key from a fixed dev seed so local dev works
            // without configuring a secret. This fallback is explicitly gated to Development.
            logger.LogWarning(
                "Ai:KeyEncryptionKey not configured — using an INSECURE derived dev key (Development only). " +
                "Set Ai:KeyEncryptionKey (base64 32 bytes) in staging/production via GCP Secret Manager.");
            _key = SHA256.HashData(Encoding.UTF8.GetBytes("snapaccount-local-dev-ai-key-protector-v1"));
        }
        else
        {
            // SEC-AI-02 M-05: Fail fast in non-Development environments with no key configured.
            throw new InvalidOperationException(
                "Ai:KeyEncryptionKey must be configured in non-Development environments. " +
                "Set this 32-byte base64 value via GCP Secret Manager.");
        }
    }

    /// <summary>
    /// Encrypts <paramref name="plaintext"/> using AES-256-GCM (authenticated encryption).
    /// Output format: Base64( 0x02 || Nonce(12) || Tag(16) || Ciphertext ).
    /// SEC-AI-02 H-01: GCM provides ciphertext integrity — any tampering causes decryption to throw.
    /// </summary>
    public string Encrypt(string plaintext)
    {
        var plain = Encoding.UTF8.GetBytes(plaintext);
        var nonce = new byte[GcmNonceSize];
        RandomNumberGenerator.Fill(nonce);

        var ciphertext = new byte[plain.Length];
        var tag = new byte[GcmTagSize];

        using var gcm = new AesGcm(_key, GcmTagSize);
        gcm.Encrypt(nonce, plain, ciphertext, tag);

        // Layout: version(1) || nonce(12) || tag(16) || ciphertext
        var result = new byte[1 + GcmNonceSize + GcmTagSize + ciphertext.Length];
        result[0] = GcmVersionByte;
        Buffer.BlockCopy(nonce, 0, result, 1, GcmNonceSize);
        Buffer.BlockCopy(tag, 0, result, 1 + GcmNonceSize, GcmTagSize);
        Buffer.BlockCopy(ciphertext, 0, result, 1 + GcmNonceSize + GcmTagSize, ciphertext.Length);

        return Convert.ToBase64String(result);
    }

    /// <summary>
    /// Decrypts a ciphertext previously produced by <see cref="Encrypt"/> (v2/GCM) or by the
    /// legacy CBC encryptor (v1 — recognised by first byte != 0x02).
    /// Throws <see cref="CryptographicException"/> if the GCM authentication tag does not match
    /// (tamper detected). Legacy CBC decryption is preserved for backward compatibility with
    /// existing stored keys; re-encrypt at the call site to migrate to v2.
    /// </summary>
    public string Decrypt(string ciphertext)
    {
        var all = Convert.FromBase64String(ciphertext);

        // Detect v2 (GCM) vs. v1 (CBC).
        // v2 has GcmVersionByte (0x02) as first byte, plus minimum length of 1+12+16+1 = 30 bytes.
        if (all.Length >= 1 + GcmNonceSize + GcmTagSize + 1 && all[0] == GcmVersionByte)
            return DecryptGcm(all);

        // Legacy v1 (CBC): first 16 bytes are IV, remainder is ciphertext.
        return DecryptLegacyCbc(all);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private string DecryptGcm(byte[] all)
    {
        var nonce = all[1..(1 + GcmNonceSize)];
        var tag = all[(1 + GcmNonceSize)..(1 + GcmNonceSize + GcmTagSize)];
        var cipher = all[(1 + GcmNonceSize + GcmTagSize)..];
        var plain = new byte[cipher.Length];

        using var gcm = new AesGcm(_key, GcmTagSize);
        gcm.Decrypt(nonce, cipher, tag, plain); // Throws CryptographicException on tag mismatch.

        return Encoding.UTF8.GetString(plain);
    }

    private string DecryptLegacyCbc(byte[] all)
    {
        // SEC-AI-02 H-01 note: CBC is decryption-only (no new encryptions use this path).
        // No MAC check — legacy format. Callers should re-encrypt with v2 after successful decrypt.
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
