namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Abstraction over GCS for storing and retrieving loan PDF packages.
/// Loan-specific: supports per-call bucket names and signed URL generation with expiry.
/// </summary>
public interface ILoanStorageService
{
    /// <summary>Uploads bytes to GCS and returns the gs:// URI.</summary>
    Task<string> UploadAsync(string bucketName, string objectName, byte[] content, string contentType, CancellationToken ct);

    /// <summary>Generates a short-lived signed download URL (default 1 hour).</summary>
    Task<string> GetSignedDownloadUrlAsync(string bucketName, string objectName, TimeSpan expiry, CancellationToken ct);
}
