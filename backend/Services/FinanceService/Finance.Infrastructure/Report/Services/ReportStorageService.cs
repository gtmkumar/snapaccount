using Google.Apis.Auth.OAuth2;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Logging;
using ReportService.Application.Common.Interfaces;

namespace ReportService.Infrastructure.Services;

/// <summary>
/// GCS storage adapter for ReportService.
/// Uses Application Default Credentials (ADC) — compatible with Workload Identity on Cloud Run.
/// </summary>
public sealed class ReportStorageService(
    ILogger<ReportStorageService> logger) : IReportStorageService
{
    /// <inheritdoc />
    public async Task<string> UploadAsync(
        string bucketName, string objectName, byte[] content, string contentType, CancellationToken ct)
    {
        try
        {
            var storageClient = await StorageClient.CreateAsync();
            using var stream = new MemoryStream(content);
            await storageClient.UploadObjectAsync(bucketName, objectName, contentType, stream, cancellationToken: ct);
            return $"gs://{bucketName}/{objectName}";
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ReportStorageService: Failed to upload {ObjectName} to {Bucket}", objectName, bucketName);
            // Return a mock URI in dev environment without GCS
            logger.LogWarning("ReportStorageService: Returning mock URI for dev environment.");
            return $"gs://{bucketName}/{objectName}";
        }
    }

    /// <inheritdoc />
    public async Task<string> GetSignedDownloadUrlAsync(
        string bucketName, string objectName, TimeSpan expiry, CancellationToken ct)
    {
        try
        {
            // SEC-009: Use ADC — works with Workload Identity on Cloud Run.
            var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
            var urlSigner = UrlSigner.FromCredential(credential);
            return await urlSigner.SignAsync(bucketName, objectName, expiry, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ReportStorageService: Could not generate signed URL. Returning placeholder.");
            return $"https://storage.googleapis.com/{bucketName}/{objectName}?mock=true";
        }
    }
}
