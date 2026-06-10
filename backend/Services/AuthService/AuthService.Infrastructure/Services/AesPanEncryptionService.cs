using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// NEW-003: AES-256-GCM implementation of <see cref="IPanEncryptionService"/>.
/// Migrated from AES-256-CBC (SEC-013) to AES-256-GCM for authenticated encryption
/// which prevents ciphertext forgery (no PKCS#7 padding-oracle attack surface).
///
/// Storage format (new — prefix byte 0x02 = GCM):
///   Base64( 0x02 || Nonce[12 bytes] || Tag[16 bytes] || Ciphertext )
///
/// Legacy format (old — AES-CBC, prefix byte 0x01 OR no prefix byte):
///   Base64( IV[16 bytes] || Ciphertext )
///   (total length is always ≥ 33 bytes; GCM output is ≥ 29 bytes but always has 0x02 prefix)
///
/// Back-compat decrypt:
///   If the decoded bytes start with 0x02 → GCM decrypt.
///   Otherwise → CBC decrypt (legacy). Re-encrypt on next write is NOT done automatically
///   to avoid data mutations on read; callers must trigger re-encryption explicitly if desired.
///
/// Key: 32-byte (256-bit) value loaded from PanEncryption:Key config (base64-encoded).
/// Production key: Cloud Run secret 'pan-encryption-key' via GCP Secret Manager.
/// </summary>
public sealed class AesPanEncryptionService : IPanEncryptionService
{
    private const byte GcmMarker  = 0x02;
    private const byte CbcMarker  = 0x01;   // reserved for future explicit CBC detection
    private const int  GcmNonce   = 12;
    private const int  GcmTag     = 16;
    private const int  CbcIv      = 16;

    private readonly byte[] _key;

    public AesPanEncryptionService(IConfiguration configuration)
    {
        var keyBase64 = configuration["PanEncryption:Key"]
            ?? throw new InvalidOperationException(
                "PanEncryption:Key configuration is missing. " +
                "Set PAN_ENCRYPTION_KEY env var or configure via GCP Secret Manager.");

        _key = Convert.FromBase64String(keyBase64);
        if (_key.Length != 32)
            throw new InvalidOperationException(
                $"PanEncryption:Key must be a base64-encoded 256-bit (32-byte) key. Got {_key.Length} bytes.");
    }

    /// <summary>
    /// Encrypts a PAN using AES-256-GCM.
    /// Output format: Base64( 0x02 || Nonce[12] || Tag[16] || Ciphertext ).
    /// </summary>
    public string Encrypt(string pan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pan);

        var nonce      = RandomNumberGenerator.GetBytes(GcmNonce);
        var plainBytes = Encoding.UTF8.GetBytes(pan);
        var cipher     = new byte[plainBytes.Length];
        var tag        = new byte[GcmTag];

        using var aes = new AesGcm(_key, GcmTag);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        // Layout: 0x02 | nonce (12) | tag (16) | ciphertext
        var result = new byte[1 + GcmNonce + GcmTag + cipher.Length];
        result[0] = GcmMarker;
        nonce.CopyTo(result, 1);
        tag.CopyTo(result, 1 + GcmNonce);
        cipher.CopyTo(result, 1 + GcmNonce + GcmTag);

        return Convert.ToBase64String(result);
    }

    /// <summary>
    /// Decrypts a PAN.
    /// Supports both GCM (new, 0x02 prefix) and legacy CBC (no prefix).
    /// </summary>
    public string Decrypt(string encryptedPan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(encryptedPan);

        var allBytes = Convert.FromBase64String(encryptedPan);

        // Determine format by the first byte.
        if (allBytes.Length >= 1 + GcmNonce + GcmTag + 1 && allBytes[0] == GcmMarker)
            return DecryptGcm(allBytes);

        // Legacy AES-256-CBC (no marker byte, or marker 0x01).
        return DecryptCbc(allBytes);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private string DecryptGcm(byte[] allBytes)
    {
        // Layout: 0x02 | nonce (12) | tag (16) | ciphertext
        var nonce  = allBytes[1..(1 + GcmNonce)];
        var tag    = allBytes[(1 + GcmNonce)..(1 + GcmNonce + GcmTag)];
        var cipher = allBytes[(1 + GcmNonce + GcmTag)..];
        var plain  = new byte[cipher.Length];

        using var aes = new AesGcm(_key, GcmTag);
        aes.Decrypt(nonce, cipher, tag, plain);

        return Encoding.UTF8.GetString(plain);
    }

    private string DecryptCbc(byte[] allBytes)
    {
        if (allBytes.Length < CbcIv + 1)
            throw new CryptographicException("Encrypted PAN is too short to be a valid CBC payload.");

        var iv         = allBytes[..CbcIv];
        var cipherBytes = allBytes[CbcIv..];

        using var aes = Aes.Create();
        aes.Key     = _key;
        aes.IV      = iv;
        aes.Mode    = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        using var decryptor = aes.CreateDecryptor();
        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
