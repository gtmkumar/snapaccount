namespace AuthService.Application.Interfaces;

/// <summary>
/// DG-SEC-04: Abstracts GCS upload and signed-URL generation for DPDP data-export bundles.
///
/// In production the implementation uploads the JSON bundle to the
/// <c>GCS:DpdpExportsBucket</c> bucket and returns a 24-hour signed URL.
/// In local dev (no GCP credentials) a fallback writes to a temp directory
/// and returns a <c>file://</c> URI — the download link is not functional in that
/// mode but the rest of the export flow (status transitions, JSON assembly) is exercised.
/// </summary>
public interface IDataExportStorageService
{
    /// <summary>
    /// Uploads the serialised JSON <paramref name="bundleJson"/> to GCS at
    /// <c>dpdp-exports/{userId}/{requestId}.json</c> and returns
    /// (<see cref="gcsObjectPath"/>, <see cref="signedUrl"/>, <see cref="signedUrlExpiresAt"/>).
    /// </summary>
    Task<(string GcsObjectPath, string SignedUrl, DateTime SignedUrlExpiresAt)>
        UploadAndSignAsync(
            Guid   userId,
            Guid   requestId,
            string bundleJson,
            CancellationToken ct = default);
}
