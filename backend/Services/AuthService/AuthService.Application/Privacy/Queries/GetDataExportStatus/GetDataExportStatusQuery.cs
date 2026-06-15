using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Queries.GetDataExportStatus;

/// <summary>
/// Returns the status of the most-recent (or a specific) data-export request
/// for the authenticated user.
/// </summary>
/// <param name="RequestId">
/// Optional — if provided, returns that specific request (must belong to the caller).
/// If null, returns the most recent request.
/// </param>
public record GetDataExportStatusQuery(Guid? RequestId) : IQuery<DataExportStatusResult>;

/// <summary>Status snapshot returned to the caller.</summary>
public sealed record DataExportStatusResult(
    Guid RequestId,
    string Status,
    string? DownloadUrl,
    DateTime? DownloadUrlExpiresAt,
    string? ErrorMessage,
    DateTime CreatedAt);

/// <summary>Reads the status of a data export request for the authenticated user.</summary>
public sealed class GetDataExportStatusQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetDataExportStatusQuery, DataExportStatusResult>
{
    /// <inheritdoc />
    public async Task<Result<DataExportStatusResult>> Handle(
        GetDataExportStatusQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var row = request.RequestId.HasValue
            ? await db.DataExportRequests
                .Where(r => r.Id == request.RequestId.Value
                            && r.UserId == userId
                            && r.DeletedAt == null)
                .FirstOrDefaultAsync(cancellationToken)
            : await db.DataExportRequests
                .Where(r => r.UserId == userId && r.DeletedAt == null)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
            return Result<DataExportStatusResult>.Failure(
                Error.NotFound("DataExportRequest", request.RequestId ?? userId));

        return Result<DataExportStatusResult>.Success(
            new DataExportStatusResult(
                row.Id,
                row.Status,
                row.DownloadUrl,
                row.DownloadUrlExpiresAt,
                row.ErrorMessage,
                row.CreatedAt));
    }
}
