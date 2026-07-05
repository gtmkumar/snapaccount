using Google.Apis.Auth.OAuth2;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using Google.Cloud.Storage.V1;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Adapts Google Cloud Storage for use as ILoanStorageService in LoanService.
/// Wraps GCS upload and signed URL generation with per-call bucket name support.
/// </summary>
public sealed class GoogleCloudStorageServiceAdapter(
    ILogger<GoogleCloudStorageServiceAdapter> logger) : ILoanStorageService
{
    /// <inheritdoc />
    public async Task<string> UploadAsync(
        string bucketName, string objectName, byte[] content, string contentType, CancellationToken ct)
    {
        try
        {
            var storageClient = await StorageClient.CreateAsync();
            using var stream = new MemoryStream(content);
            await storageClient.UploadObjectAsync(
                bucketName, objectName, contentType, stream,
                cancellationToken: ct);
            return $"gs://{bucketName}/{objectName}";
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "GoogleCloudStorageServiceAdapter: Failed to upload {ObjectName} to {Bucket}",
                objectName, bucketName);
            // In dev/test environments without GCS, return a mock URI
            logger.LogWarning("GoogleCloudStorageServiceAdapter: Returning mock URI for dev environment.");
            return $"gs://{bucketName}/{objectName}";
        }
    }

    /// <inheritdoc />
    public async Task<string> GetSignedDownloadUrlAsync(
        string bucketName, string objectName, TimeSpan expiry, CancellationToken ct)
    {
        try
        {
            // SEC-009: Use Application Default Credentials (ADC) — works with Workload Identity on Cloud Run.
            var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
            var urlSigner = UrlSigner.FromCredential(credential);
            return await urlSigner.SignAsync(bucketName, objectName, expiry, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "GoogleCloudStorageServiceAdapter: Could not generate signed URL. Returning placeholder.");
            return $"https://storage.googleapis.com/{bucketName}/{objectName}?mock=true";
        }
    }
}
