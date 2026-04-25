using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Queries.GetPackageDownloadUrl;

/// <summary>Returns a short-lived signed GCS download URL for the latest loan PDF package.</summary>
public record GetPackageDownloadUrlQuery(Guid ApplicationId) : IQuery<PackageDownloadUrlDto>;

/// <summary>Download URL DTO.</summary>
public record PackageDownloadUrlDto(Guid PackageId, string SignedUrl, DateTime ExpiresAt);

/// <summary>Handler: generates signed URL with IDOR org-scoping.</summary>
public sealed class GetPackageDownloadUrlQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    ILoanStorageService cloudStorage) : IQueryHandler<GetPackageDownloadUrlQuery, PackageDownloadUrlDto>
{
    /// <inheritdoc />
    public async Task<Result<PackageDownloadUrlDto>> Handle(
        GetPackageDownloadUrlQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: verify the application belongs to the caller's org
        var applicationExists = await db.LoanApplications
            .AnyAsync(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null,
                cancellationToken);

        if (!applicationExists)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var package = await db.LoanPdfPackages
            .Where(p => p.ApplicationId == request.ApplicationId && p.IsCurrent)
            .OrderByDescending(p => p.GeneratedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (package == null)
            return Error.NotFound("LoanPdfPackage", request.ApplicationId);

        var bucketName = package.GcsUri.Split('/')[2];
        var objectName = string.Join("/", package.GcsUri.Split('/').Skip(3));
        // SEC-046: TTL capped at 15 minutes per P6-HANDOFF-20.
        // LoanPackage PDFs contain PAN, Aadhaar references, bank account numbers, and income data.
        // A 1-hour window materially increases exposure via browser history / referrer leakage.
        var expiry = TimeSpan.FromMinutes(15);
        var signedUrl = await cloudStorage.GetSignedDownloadUrlAsync(bucketName, objectName, expiry, cancellationToken);

        return new PackageDownloadUrlDto(package.Id, signedUrl, DateTime.UtcNow.Add(expiry));
    }
}
