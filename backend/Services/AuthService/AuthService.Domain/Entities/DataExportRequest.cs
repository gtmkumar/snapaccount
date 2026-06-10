using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// DPDP Act 2023 — Per-user data export (portability) request.
///
/// A request is created immediately (Status = "pending") and a Hangfire background
/// job picks it up, produces a JSON bundle stored in GCS, then updates the row
/// to Status = "ready" with a signed download URL. On failure, Status = "failed".
/// </summary>
public class DataExportRequest : BaseAuditableEntity
{
    /// <summary>FK to the requesting user.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Processing status: "pending" | "processing" | "ready" | "failed".</summary>
    public string Status { get; private set; } = "pending";

    /// <summary>
    /// GCS object path of the produced JSON bundle.
    /// Populated when Status transitions to "ready".
    /// </summary>
    public string? GcsObjectPath { get; private set; }

    /// <summary>
    /// Signed download URL valid for 24 hours.
    /// Populated when Status transitions to "ready".
    /// </summary>
    public string? DownloadUrl { get; private set; }

    /// <summary>UTC expiry of the signed URL.</summary>
    public DateTime? DownloadUrlExpiresAt { get; private set; }

    /// <summary>Error message if Status = "failed".</summary>
    public string? ErrorMessage { get; private set; }

    /// <summary>Hangfire job ID for traceability.</summary>
    public string? HangfireJobId { get; private set; }

    private DataExportRequest() { }

    /// <summary>Enqueues a new pending export request.</summary>
    public static DataExportRequest Create(Guid userId)
        => new()
        {
            UserId = userId,
            Status = "pending",
        };

    /// <summary>Marks the export job as actively processing.</summary>
    public void MarkProcessing(string hangfireJobId)
    {
        Status = "processing";
        HangfireJobId = hangfireJobId;
    }

    /// <summary>Marks the export as ready with a GCS object path and signed URL.</summary>
    public void MarkReady(string gcsObjectPath, string downloadUrl, DateTime expiresAt)
    {
        Status = "ready";
        GcsObjectPath = gcsObjectPath;
        DownloadUrl = downloadUrl;
        DownloadUrlExpiresAt = expiresAt;
    }

    /// <summary>Marks the export as failed with a diagnostic message.</summary>
    public void MarkFailed(string errorMessage)
    {
        Status = "failed";
        ErrorMessage = errorMessage;
    }
}
