using ItrService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;

namespace ItrService.Infrastructure.Services;

/// <summary>
/// SEC-041 (mirrors SEC-013 in AuthService): AES-256-CBC implementation of
/// <see cref="IPanEncryptionService"/>. Key from PanEncryption:Key configuration
/// (32 bytes, base64). Storage format: Base64( IV[16] || Ciphertext ).
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

        var result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);

        return Convert.ToBase64String(result);
    }

    public string Decrypt(string encryptedPan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(encryptedPan);

        var allBytes = Convert.FromBase64String(encryptedPan);
        if (allBytes.Length < 17)
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
