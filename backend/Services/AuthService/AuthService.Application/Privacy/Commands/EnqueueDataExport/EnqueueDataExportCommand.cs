using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Commands.EnqueueDataExport;

/// <summary>
/// Enqueues a DPDP Act 2023 data-portability export job for the authenticated user.
///
/// A <see cref="DataExportRequest"/> row is written with Status = "pending" and a
/// Hangfire job ID is returned so the caller can poll
/// <c>GET /auth/me/data-export/status</c>.  Only one active request per user
/// is allowed at a time (returns the existing request if one is pending/processing).
/// </summary>
public record EnqueueDataExportCommand : ICommand<EnqueueDataExportResult>;

/// <summary>Returned after the export is queued (or an existing request found).</summary>
/// <param name="RequestId">The <see cref="DataExportRequest.Id"/> to use for polling.</param>
/// <param name="Status">Current status of the request.</param>
/// <param name="ExistingRequest">True when an in-flight request already existed.</param>
public sealed record EnqueueDataExportResult(Guid RequestId, string Status, bool ExistingRequest);

/// <summary>
/// Writes a new <see cref="DataExportRequest"/> and schedules the Hangfire export job.
/// </summary>
public sealed class EnqueueDataExportCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IDataExportJobScheduler exportScheduler)
    : ICommandHandler<EnqueueDataExportCommand, EnqueueDataExportResult>
{
    /// <inheritdoc />
    public async Task<Result<EnqueueDataExportResult>> Handle(
        EnqueueDataExportCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Idempotency: return the in-progress request if one exists.
        var inFlight = await db.DataExportRequests
            .Where(r => r.UserId == userId
                        && r.DeletedAt == null
                        && (r.Status == "pending" || r.Status == "processing"))
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (inFlight is not null)
            return Result<EnqueueDataExportResult>.Success(
                new EnqueueDataExportResult(inFlight.Id, inFlight.Status, true));

        var exportRequest = DataExportRequest.Create(userId);
        db.DataExportRequests.Add(exportRequest);
        await db.SaveChangesAsync(cancellationToken);

        // Schedule the Hangfire job; the job will call MarkProcessing + MarkReady/MarkFailed.
        exportScheduler.Schedule(exportRequest.Id, userId);

        return Result<EnqueueDataExportResult>.Success(
            new EnqueueDataExportResult(exportRequest.Id, exportRequest.Status, false));
    }
}
