using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// SEC-013: AES-256-CBC implementation of <see cref="IPanEncryptionService"/>.
/// Key is a 32-byte (256-bit) value loaded from GCP Secret Manager via the
/// PAN_ENCRYPTION_KEY environment variable (base64-encoded 32 bytes).
///
/// Storage format: Base64( IV[16 bytes] || Ciphertext )
///
/// Dev placeholder key is set in appsettings.json. Production key is injected
/// by Cloud Run from GCP Secret Manager secret 'pan-encryption-key'.
/// </summary>
public sealed class AesPanEncryptionService : IPanEncryptionService
{
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

    /// <inheritdoc />
    public string Encrypt(string pan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pan);

        using var aes = Aes.Create();
        aes.Key = _key;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(pan);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        // Prepend 16-byte IV to ciphertext so we can recover it on decrypt
        var result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);

        return Convert.ToBase64String(result);
    }

    /// <inheritdoc />
    public string Decrypt(string encryptedPan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(encryptedPan);

        var allBytes = Convert.FromBase64String(encryptedPan);
        if (allBytes.Length < 17) // must have at least IV (16) + 1 byte ciphertext
            throw new CryptographicException("Encrypted PAN is too short to be valid.");

        var iv = allBytes[..16];
        var cipherBytes = allBytes[16..];

        using var aes = Aes.Create();
        aes.Key = _key;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        using var decryptor = aes.CreateDecryptor();
        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
