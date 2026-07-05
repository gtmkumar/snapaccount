using AuthService.Application.Interfaces;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// DG-SEC-04: Uploads a DPDP data-export bundle to Google Cloud Storage and generates
/// a 24-hour signed download URL.
///
/// Bucket: <c>GCS:DpdpExportsBucket</c> config key; falls back to
/// <c>GCS:DocumentsBucket</c> if absent (single-bucket dev convenience).
///
/// Dev fallback: when GCS credentials are absent (local dev), writes the bundle to the
/// OS temp directory and returns a <c>local://</c> pseudo-URI so the rest of the export
/// status flow (MarkProcessing → MarkReady) still executes without GCP. The download URL
/// will not be clickable in that mode — the log makes this explicit.
/// </summary>
public sealed class GcsDataExportStorageService(
    IConfiguration configuration,
    ILogger<GcsDataExportStorageService> logger) : IDataExportStorageService
{
    private const string ExportFolder = "dpdp-exports";
    private static readonly TimeSpan SignedUrlExpiry = TimeSpan.FromHours(24);

    /// <inheritdoc />
    public async Task<(string GcsObjectPath, string SignedUrl, DateTime SignedUrlExpiresAt)>
        UploadAndSignAsync(
            Guid userId,
            Guid requestId,
            string bundleJson,
            CancellationToken ct = default)
    {
        var objectName = $"{ExportFolder}/{userId}/{requestId}.json";
        var expiresAt  = DateTime.UtcNow.Add(SignedUrlExpiry);

        var bucketName = configuration["GCS:DpdpExportsBucket"]
                      ?? configuration["GCS:DocumentsBucket"];

        if (string.IsNullOrWhiteSpace(bucketName))
        {
            // Dev mode: no bucket configured — write to temp and return local path.
            return await WriteLocalFallbackAsync(objectName, bundleJson, expiresAt, ct);
        }

        try
        {
            var storageClient = StorageClient.Create();
            var jsonBytes     = Encoding.UTF8.GetBytes(bundleJson);

            await using var stream = new MemoryStream(jsonBytes);
            await storageClient.UploadObjectAsync(
                bucketName,
                objectName,
                "application/json",
                stream,
                cancellationToken: ct);

            logger.LogInformation(
                "GcsDataExportStorageService: uploaded DPDP bundle for user {UserId} " +
                "to gs://{Bucket}/{Object}.",
                userId, bucketName, objectName);

            // Generate a 24-hour signed URL via ADC.
            var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
            var urlSigner  = UrlSigner.FromCredential(credential);
            var signedUrl  = await urlSigner.SignAsync(bucketName, objectName, SignedUrlExpiry);

            logger.LogInformation(
                "GcsDataExportStorageService: signed URL generated for user {UserId} " +
                "(expires {ExpiresAt:u}).", userId, expiresAt);

            return (objectName, signedUrl, expiresAt);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // SEC-009 / dev-box: ADC not available — fall back to local.
            logger.LogWarning(ex,
                "GcsDataExportStorageService: GCS upload failed (credentials absent?). " +
                "Falling back to local temp storage for request {RequestId}.", requestId);

            return await WriteLocalFallbackAsync(objectName, bundleJson, expiresAt, ct);
        }
    }

    // ─── local dev fallback ───────────────────────────────────────────────────

    private async Task<(string, string, DateTime)> WriteLocalFallbackAsync(
        string objectName,
        string bundleJson,
        DateTime expiresAt,
        CancellationToken ct)
    {
        var rootDir  = Path.Combine(Path.GetTempPath(), "snapaccount-dpdp-exports");
        var filePath = Path.Combine(
            rootDir,
            objectName.Replace('/', Path.DirectorySeparatorChar));

        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        await File.WriteAllTextAsync(filePath, bundleJson, Encoding.UTF8, ct);

        var localUri = new Uri(filePath).AbsoluteUri;

        logger.LogWarning(
            "GcsDataExportStorageService [DEV FALLBACK]: bundle written to {FilePath}. " +
            "Download URL is a local file:// URI — not functional in prod. " +
            "Set GCS:DpdpExportsBucket (or GCS:DocumentsBucket) and ensure ADC is available.",
            filePath);

        return ($"local://{objectName}", localUri, expiresAt);
    }
}
