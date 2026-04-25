using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Queries.GetDownloadUrl;

/// <summary>Generates a signed GCS download URL for a completed report job.</summary>
public record GetDownloadUrlQuery(Guid JobId) : IQuery<ReportDownloadUrlDto>;

/// <summary>Signed download URL DTO.</summary>
public record ReportDownloadUrlDto(Guid JobId, string SignedUrl, DateTime ExpiresAt);

/// <summary>Handler: returns signed URL with IDOR org-scoping.</summary>
public sealed class GetDownloadUrlQueryHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser,
    IReportStorageService storage) : IQueryHandler<GetDownloadUrlQuery, ReportDownloadUrlDto>
{
    private const string ReportsBucket = "GCS_REPORTS_BUCKET";

    /// <inheritdoc />
    public async Task<Result<ReportDownloadUrlDto>> Handle(
        GetDownloadUrlQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var job = await db.ReportJobs
            .Where(j => j.Id == request.JobId && j.OrgId == orgId &&
                        j.Status == ReportJobStatus.Completed && j.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (job == null)
            return Error.NotFound("ReportJob", request.JobId);

        if (string.IsNullOrEmpty(job.GcsUri))
            return Result<ReportDownloadUrlDto>.Failure(
                Error.Validation("ReportJob.NoFile", "Report file is not available."));

        // Parse gs://bucket/object-name
        var uri = new Uri(job.GcsUri);
        var bucketName = uri.Host;
        var objectName = uri.AbsolutePath.TrimStart('/');
        // SEC-046: TTL capped at 15 minutes per P6-HANDOFF-20.
        // Report PDFs may contain financial PII; long-lived URLs expose data via browser history.
        var expiry = TimeSpan.FromMinutes(15);

        var signedUrl = await storage.GetSignedDownloadUrlAsync(bucketName, objectName, expiry, cancellationToken);

        return new ReportDownloadUrlDto(job.Id, signedUrl, DateTime.UtcNow.Add(expiry));
    }
}
