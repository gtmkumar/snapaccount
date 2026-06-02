using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Local-filesystem fallback for <see cref="ICloudStorageService"/> used in local dev
/// when GCP is disabled (no Application Default Credentials). Writes uploaded objects under
/// <c>{temp}/snapaccount-documents/{objectName}</c> and returns a <c>local://</c> path so the
/// document upload + scan flow works end-to-end without Google Cloud Storage.
/// NEVER registered in staging/production — those use <see cref="GoogleCloudStorageService"/>.
/// </summary>
public sealed class LocalFileStorageService(ILogger<LocalFileStorageService> logger) : ICloudStorageService
{
    private static readonly string RootDir =
        Path.Combine(Path.GetTempPath(), "snapaccount-documents");

    public async Task<string> UploadAsync(
        Stream content, string objectName, string contentType, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(RootDir, objectName.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using (var file = File.Create(fullPath))
            await content.CopyToAsync(file, ct);

        logger.LogWarning(
            "LOCAL STORAGE (dev): wrote object {ObjectName} to {FullPath} ({ContentType}) — GCS is disabled.",
            objectName, fullPath, contentType);

        return $"local://{objectName}";
    }

    public Task<Stream> DownloadAsync(string objectName, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(RootDir, ExtractObjectName(objectName).Replace('/', Path.DirectorySeparatorChar));
        Stream stream = File.OpenRead(fullPath);
        return Task.FromResult(stream);
    }

    public Task<string> GetSignedUrlAsync(string objectName, TimeSpan expiry, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(RootDir, ExtractObjectName(objectName).Replace('/', Path.DirectorySeparatorChar));
        // Dev only: hand back a file:// URI so callers have something openable locally.
        return Task.FromResult(new Uri(fullPath).AbsoluteUri);
    }

    public Task DeleteAsync(string objectName, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(RootDir, ExtractObjectName(objectName).Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(fullPath)) File.Delete(fullPath);
        return Task.CompletedTask;
    }

    private static string ExtractObjectName(string storagePath) =>
        storagePath.StartsWith("local://", StringComparison.OrdinalIgnoreCase)
            ? storagePath["local://".Length..]
            : storagePath;
}
