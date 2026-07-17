using Google.Apis.Auth.OAuth2;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Resilience;

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
    ILogger<GoogleCloudStorageService> logger,
    IExternalCallGuard? guard = null) : ICloudStorageService
{
    // Guarded dependency name — tune via Resilience:Dependency:gcs (larger uploads/downloads
    // need a longer attempt timeout than the 10s default; composites set 30s in appsettings).
    private const string Dependency = "gcs";

    private readonly string _bucketName = configuration["GCS:DocumentsBucket"]
        ?? throw new InvalidOperationException("GCS:DocumentsBucket configuration is missing.");

    private readonly StorageClient _storageClient = StorageClient.Create();

    private Task<T> GuardedAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct) =>
        guard is null ? action(ct) : guard.ExecuteAsync(Dependency, action, ct);

    public async Task<string> UploadAsync(
        Stream content,
        string objectName,
        string contentType,
        CancellationToken ct = default)
    {
        logger.LogInformation("Uploading object {ObjectName} to bucket {Bucket}", objectName, _bucketName);

        var dataObject = await GuardedAsync(
            token => _storageClient.UploadObjectAsync(_bucketName, objectName, contentType, content, cancellationToken: token),
            ct);

        return $"gs://{_bucketName}/{dataObject.Name}";
    }

    public async Task<Stream> DownloadAsync(string objectName, CancellationToken ct = default)
    {
        var memoryStream = new MemoryStream();
        await GuardedAsync(
            token => _storageClient.DownloadObjectAsync(_bucketName, objectName, memoryStream, cancellationToken: token),
            ct);
        memoryStream.Position = 0;
        return memoryStream;
    }

    public Task<string> GetSignedUrlAsync(string objectName, TimeSpan expiry, CancellationToken ct = default)
    {
        // SEC-009: Use Application Default Credentials (ADC) instead of service account file path.
        // This works correctly with Workload Identity on Cloud Run — no GOOGLE_APPLICATION_CREDENTIALS file required.
        var effectiveExpiry = expiry == default ? TimeSpan.FromHours(1) : expiry;
        return GuardedAsync(async token =>
        {
            var credential = await GoogleCredential.GetApplicationDefaultAsync(token);
            var urlSigner = UrlSigner.FromCredential(credential);
            return await urlSigner.SignAsync(_bucketName, objectName, effectiveExpiry);
        }, ct);
    }

    public async Task DeleteAsync(string objectName, CancellationToken ct = default)
    {
        await GuardedAsync<object?>(async token =>
        {
            await _storageClient.DeleteObjectAsync(_bucketName, objectName, cancellationToken: token);
            return null;
        }, ct);
        logger.LogInformation("Deleted object {ObjectName} from bucket {Bucket}", objectName, _bucketName);
    }
}
