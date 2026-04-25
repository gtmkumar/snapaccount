using Google.Apis.Auth.OAuth2;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace SnapAccount.Shared.Infrastructure.Storage;

public interface ICloudStorageService
{
    Task<string> UploadAsync(Stream content, string objectName, string contentType, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string objectName, CancellationToken ct = default);
    Task<string> GetSignedUrlAsync(string objectName, TimeSpan expiry, CancellationToken ct = default);
    Task DeleteAsync(string objectName, CancellationToken ct = default);
}

public sealed class GoogleCloudStorageService(
    IConfiguration configuration,
    ILogger<GoogleCloudStorageService> logger) : ICloudStorageService
{
    private readonly string _bucketName = configuration["GCS:DocumentsBucket"]
        ?? throw new InvalidOperationException("GCS:DocumentsBucket configuration is missing.");

    private readonly StorageClient _storageClient = StorageClient.Create();

    public async Task<string> UploadAsync(
        Stream content,
        string objectName,
        string contentType,
        CancellationToken ct = default)
    {
        logger.LogInformation("Uploading object {ObjectName} to bucket {Bucket}", objectName, _bucketName);

        var dataObject = await _storageClient.UploadObjectAsync(
            _bucketName,
            objectName,
            contentType,
            content,
            cancellationToken: ct);

        return $"gs://{_bucketName}/{dataObject.Name}";
    }

    public async Task<Stream> DownloadAsync(string objectName, CancellationToken ct = default)
    {
        var memoryStream = new MemoryStream();
        await _storageClient.DownloadObjectAsync(_bucketName, objectName, memoryStream, cancellationToken: ct);
        memoryStream.Position = 0;
        return memoryStream;
    }

    public async Task<string> GetSignedUrlAsync(string objectName, TimeSpan expiry, CancellationToken ct = default)
    {
        // SEC-009: Use Application Default Credentials (ADC) instead of service account file path.
        // This works correctly with Workload Identity on Cloud Run — no GOOGLE_APPLICATION_CREDENTIALS file required.
        var effectiveExpiry = expiry == default ? TimeSpan.FromHours(1) : expiry;
        var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
        var urlSigner = UrlSigner.FromCredential(credential);
        return await urlSigner.SignAsync(_bucketName, objectName, effectiveExpiry);
    }

    public async Task DeleteAsync(string objectName, CancellationToken ct = default)
    {
        await _storageClient.DeleteObjectAsync(_bucketName, objectName, cancellationToken: ct);
        logger.LogInformation("Deleted object {ObjectName} from bucket {Bucket}", objectName, _bucketName);
    }
}
