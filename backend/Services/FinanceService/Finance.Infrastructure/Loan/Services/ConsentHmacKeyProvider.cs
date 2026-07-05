using Google.Cloud.SecretManager.V1;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Provides the HMAC key for consent signature computation from GCP Secret Manager.
/// P6-HANDOFF-26: secret name is 'loan-consent-hmac-key'.
/// Falls back to a config value in development environments.
/// </summary>
public sealed class ConsentHmacKeyProvider(
    IConfiguration configuration,
    ILogger<ConsentHmacKeyProvider> logger) : IConsentHmacKeyProvider
{
    private const string SecretName = "loan-consent-hmac-key";

    /// <inheritdoc />
    public async Task<byte[]> GetKeyAsync(CancellationToken ct = default)
    {
        var projectId = configuration["GCP_PROJECT_ID"];

        if (!string.IsNullOrWhiteSpace(projectId))
        {
            try
            {
                var client = await SecretManagerServiceClient.CreateAsync(ct);
                var secretVersionName = SecretVersionName.FromProjectSecretSecretVersion(
                    projectId, SecretName, "latest");
                var response = await client.AccessSecretVersionAsync(secretVersionName, ct);
                return response.Payload.Data.ToByteArray();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "ConsentHmacKeyProvider: Failed to load from Secret Manager. Falling back to config.");
            }
        }

        // Dev fallback: load from config (never use in production)
        var devKey = configuration["LoanService:ConsentHmacKey"];
        if (!string.IsNullOrEmpty(devKey))
        {
            logger.LogWarning("ConsentHmacKeyProvider: Using dev fallback HMAC key from config. NOT for production.");
            return Convert.FromBase64String(devKey);
        }

        throw new InvalidOperationException(
            "ConsentHmacKeyProvider: Cannot load HMAC key. Configure GCP_PROJECT_ID and Secret Manager, " +
            "or set LoanService:ConsentHmacKey in appsettings (dev only).");
    }
}
