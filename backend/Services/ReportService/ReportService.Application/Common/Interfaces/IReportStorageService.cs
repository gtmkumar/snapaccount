namespace ReportService.Application.Common.Interfaces;

/// <summary>
/// GCS storage abstraction for ReportService.
/// Supports per-call bucket names for report file uploads.
/// </summary>
public interface IReportStorageService
{
    /// <summary>Uploads bytes to GCS and returns the gs:// URI.</summary>
    Task<string> UploadAsync(string bucketName, string objectName, byte[] content, string contentType, CancellationToken ct);

    /// <summary>Generates a short-lived signed download URL.</summary>
    Task<string> GetSignedDownloadUrlAsync(string bucketName, string objectName, TimeSpan expiry, CancellationToken ct);
}
