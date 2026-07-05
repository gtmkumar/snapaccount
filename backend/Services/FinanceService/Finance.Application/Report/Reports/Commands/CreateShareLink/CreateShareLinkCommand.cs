using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Commands.CreateShareLink;

/// <summary>
/// Generates a short-lived signed GCS URL for sharing a report with a CA or bank.
/// SEC-046: TTL capped at 15 minutes.
/// Use case: Share-with-CA / Share-with-bank flows in the admin UI.
/// </summary>
public record CreateShareLinkCommand(Guid JobId) : ICommand<ShareLinkResponse>;

/// <summary>Share link response DTO.</summary>
public record ShareLinkResponse(
    Guid JobId,
    string SignedUrl,
    DateTime ExpiresAt);

/// <summary>Validates CreateShareLinkCommand.</summary>
public sealed class CreateShareLinkCommandValidator : AbstractValidator<CreateShareLinkCommand>
{
    public CreateShareLinkCommandValidator()
    {
        RuleFor(x => x.JobId).NotEmpty();
    }
}

/// <summary>Handler: generates a 15-minute signed URL for sharing a completed report.</summary>
public sealed class CreateShareLinkCommandHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser,
    IReportStorageService storage) : ICommandHandler<CreateShareLinkCommand, ShareLinkResponse>
{
    /// <inheritdoc />
    public async Task<Result<ShareLinkResponse>> Handle(
        CreateShareLinkCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var job = await db.ReportJobs
            .Where(j => j.Id == request.JobId
                        && j.OrgId == orgId
                        && j.Status == ReportJobStatus.Completed
                        && j.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (job == null)
            return Error.NotFound("ReportJob", request.JobId);

        if (string.IsNullOrEmpty(job.GcsUri))
            return Result<ShareLinkResponse>.Failure(
                Error.Validation("ReportJob.NoFile", "Report file is not available yet."));

        // SEC-046: max 15 minutes — consistent with GetDownloadUrl
        var expiry = TimeSpan.FromMinutes(15);

        var uri = new Uri(job.GcsUri);
        var bucketName = uri.Host;
        var objectName = uri.AbsolutePath.TrimStart('/');

        var signedUrl = await storage.GetSignedDownloadUrlAsync(
            bucketName, objectName, expiry, cancellationToken);

        return new ShareLinkResponse(job.Id, signedUrl, DateTime.UtcNow.Add(expiry));
    }
}
