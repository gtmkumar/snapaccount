using Google.Cloud.SecretManager.V1;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// P6-HANDOFF-27: AES-GCM envelope encryption/decryption for partner bank API credentials.
/// Uses GCP Secret Manager to retrieve the per-bank encryption key.
/// AES-GCM produces nonce (12 bytes) || ciphertext || tag (16 bytes).
/// </summary>
public sealed class CredentialEncryptionService(
    IConfiguration configuration,
    ILogger<CredentialEncryptionService> logger) : ICredentialEncryptionService
{
    private const int NonceSizeBytes = 12; // AES-GCM standard nonce
    private const int TagSizeBytes = 16;   // AES-GCM standard tag

    /// <inheritdoc />
    public async Task<byte[]> EncryptAsync(string plaintext, string keyRef, CancellationToken ct = default)
    {
        var key = await ResolveKeyAsync(keyRef, ct);
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = new byte[NonceSizeBytes];
        RandomNumberGenerator.Fill(nonce);

        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[TagSizeBytes];

        using var aesGcm = new AesGcm(key, TagSizeBytes);
        aesGcm.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        // Layout: nonce(12) || ciphertext || tag(16)
        var result = new byte[NonceSizeBytes + ciphertext.Length + TagSizeBytes];
        Buffer.BlockCopy(nonce, 0, result, 0, NonceSizeBytes);
        Buffer.BlockCopy(ciphertext, 0, result, NonceSizeBytes, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, result, NonceSizeBytes + ciphertext.Length, TagSizeBytes);
        return result;
    }

    /// <inheritdoc />
    public async Task<string> DecryptAsync(byte[] ciphertext, string keyRef, CancellationToken ct = default)
    {
        var key = await ResolveKeyAsync(keyRef, ct);

        if (ciphertext.Length < NonceSizeBytes + TagSizeBytes)
            throw new CryptographicException("Ciphertext too short for AES-GCM decryption.");

        var nonce = ciphertext[..NonceSizeBytes];
        var tag = ciphertext[^TagSizeBytes..];
        var data = ciphertext[NonceSizeBytes..^TagSizeBytes];
        var plaintext = new byte[data.Length];

        using var aesGcm = new AesGcm(key, TagSizeBytes);
        aesGcm.Decrypt(nonce, data, tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }

    /// <inheritdoc />
    public async Task<byte[]> GetWebhookSecretAsync(string webhookSecretRef, CancellationToken ct = default)
        => await ResolveKeyAsync(webhookSecretRef, ct);

    private async Task<byte[]> ResolveKeyAsync(string keyRef, CancellationToken ct)
    {
        var projectId = configuration["GCP_PROJECT_ID"];

        if (!string.IsNullOrWhiteSpace(projectId))
        {
            try
            {
                var client = await SecretManagerServiceClient.CreateAsync(ct);
                var secretVersionName = SecretVersionName.FromProjectSecretSecretVersion(
                    projectId, keyRef, "latest");
                var response = await client.AccessSecretVersionAsync(secretVersionName, ct);
                return response.Payload.Data.ToByteArray();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "CredentialEncryptionService: Failed to load key {KeyRef} from Secret Manager.", keyRef);
            }
        }

        // Dev fallback via config
        var devKey = configuration[$"LoanService:DevKeys:{keyRef}"];
        if (!string.IsNullOrEmpty(devKey))
        {
            logger.LogWarning(
                "CredentialEncryptionService: Using dev config key for {KeyRef}. NOT for production.", keyRef);
            return Convert.FromBase64String(devKey);
        }

        throw new InvalidOperationException(
            $"CredentialEncryptionService: Cannot resolve key for ref '{keyRef}'. " +
            "Ensure GCP_PROJECT_ID is configured and Secret Manager has the secret.");
    }
}
