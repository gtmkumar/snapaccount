using DocumentService.Application.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure.Services;

/// <summary>
/// Adapts the shared <see cref="ICloudStorageService"/> (GCS) to the
/// <see cref="IDocumentStorageService"/> interface required by the Application layer.
/// Stores documents under a per-user path: <c>{userId}/{timestamp}_{fileName}</c>.
/// </summary>
public sealed class DocumentStorageService(
    ICloudStorageService cloudStorage,
    ILogger<DocumentStorageService> logger) : IDocumentStorageService
{
    private static readonly TimeSpan SignedUrlExpiry = TimeSpan.FromHours(1);

    /// <inheritdoc />
    public async Task<Result<string>> UploadAsync(
        Stream content,
        string fileName,
        string contentType,
        Guid userId,
        CancellationToken ct = default)
    {
        try
        {
            // Organise objects by user so GCS IAM conditions can be applied per-user later
            var objectName = $"{userId}/{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{fileName}";
            var storagePath = await cloudStorage.UploadAsync(content, objectName, contentType, ct);
            logger.LogInformation("Document uploaded: {StoragePath} for user {UserId}", storagePath, userId);
            return Result<string>.Success(storagePath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload document {FileName} for user {UserId}", fileName, userId);
            return Result<string>.Failure(new Error("Document.UploadFailed", "Failed to upload document to storage."));
        }
    }

    /// <inheritdoc />
    public async Task<Result<string>> GetSignedUrlAsync(string storagePath, CancellationToken ct = default)
    {
        try
        {
            // storagePath is gs://bucket/objectName — extract object name
            var objectName = ExtractObjectName(storagePath);
            var url = await cloudStorage.GetSignedUrlAsync(objectName, SignedUrlExpiry, ct);
            return Result<string>.Success(url);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to generate signed URL for {StoragePath}", storagePath);
            return Result<string>.Failure(new Error("Document.SignedUrlFailed", "Failed to generate document download URL."));
        }
    }

    /// <inheritdoc />
    public async Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        var objectName = ExtractObjectName(storagePath);
        await cloudStorage.DeleteAsync(objectName, ct);
    }

    private static string ExtractObjectName(string storagePath)
    {
        // gs://bucket/path/to/object  →  path/to/object
        if (storagePath.StartsWith("gs://", StringComparison.OrdinalIgnoreCase))
        {
            var withoutScheme = storagePath["gs://".Length..];
            var slashIndex = withoutScheme.IndexOf('/');
            return slashIndex >= 0 ? withoutScheme[(slashIndex + 1)..] : withoutScheme;
        }
        return storagePath;
    }
}
