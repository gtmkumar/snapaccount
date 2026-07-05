using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Hangfire-backed implementation of <see cref="IDataExportJobScheduler"/>.
///
/// Schedules a durable background job that: loads the user's data from ALL schemas
/// (auth + document + gst + loan + itr + accounting + chat + callback), serialises
/// the full bundle to JSON, uploads to GCS, and marks the <c>DataExportRequest</c>
/// row ready with a 24-hour signed URL.
///
/// DG-SEC-04: previously only auth-schema data was included and the GCS upload was
/// a placeholder. This implementation aggregates all PII-bearing schemas and performs
/// a real GCS upload (with dev fallback to local temp dir).
/// </summary>
public sealed class HangfireDataExportScheduler(IBackgroundJobClient backgroundJobClient)
    : IDataExportJobScheduler
{
    /// <inheritdoc />
    public string Schedule(Guid requestId, Guid userId)
        => backgroundJobClient.Enqueue<DataExportJob>(
            job => job.ExecuteAsync(requestId, userId, CancellationToken.None));
}

/// <summary>
/// Hangfire job that assembles and uploads the DPDP data export bundle.
///
/// On success: updates DataExportRequest → Status = "ready", sets DownloadUrl.
/// On failure: Hangfire retries automatically; after exhaustion marks → "failed".
///
/// DG-SEC-04 fix:
///   1. <see cref="IDpdpDataAggregator"/> fetches personal data from all non-auth
///      schemas (document, gst, loan, itr, accounting, chat, callback).
///   2. <see cref="IDataExportStorageService"/> uploads the complete JSON bundle to
///      GCS (bucket: GCS:DpdpExportsBucket) and returns a 24-hour signed URL.
///      Falls back to local temp dir if GCS is unavailable (local dev only).
/// </summary>
public sealed class DataExportJob(
    IAuthDbContext           db,
    IDpdpDataAggregator      dataAggregator,
    IDataExportStorageService storageService,
    ILogger<DataExportJob>   logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented    = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>
    /// Assembles the full cross-schema user data bundle and uploads it to GCS.
    /// </summary>
    public async Task ExecuteAsync(Guid requestId, Guid userId, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "DataExportJob: starting DPDP export for request {RequestId} (user {UserId}).",
            requestId, userId);

        var exportRequest = await db.DataExportRequests
            .FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);

        if (exportRequest is null)
        {
            logger.LogWarning(
                "DataExportJob: DataExportRequest {RequestId} not found.", requestId);
            return;
        }

        exportRequest.MarkProcessing(requestId.ToString());
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            // ── 1. Auth-schema data (same DB context already available) ─────────
            var user = await db.Users
                .Where(u => u.Id == userId)
                .Select(u => new
                {
                    u.Id,
                    u.PhoneNumber,
                    u.Email,
                    u.IsActive,
                    u.CreatedAt
                })
                .FirstOrDefaultAsync(cancellationToken);

            var profile = await db.UserProfiles
                .Where(p => p.UserId == userId)
                .Select(p => new
                {
                    p.DateOfBirth,
                    p.Gender,
                    p.AddressLine1,
                    p.City,
                    p.State,
                    p.Pincode
                })
                .FirstOrDefaultAsync(cancellationToken);

            var consents = await db.UserConsents
                .Where(c => c.UserId == userId && c.DeletedAt == null)
                .Select(c => new
                {
                    c.Purpose,
                    c.Status,
                    c.ActionAt,
                    c.NoticeVersion
                })
                .ToListAsync(cancellationToken);

            var correctionRequests = await db.DataCorrectionRequests
                .Where(r => r.UserId == userId && r.DeletedAt == null)
                .Select(r => new
                {
                    r.DataCategory,
                    r.Description,
                    r.Status,
                    r.CreatedAt
                })
                .ToListAsync(cancellationToken);

            // ── 2. Cross-schema data (document, gst, loan, itr, accounting, chat, callback) ──
            // DG-SEC-04: previously this section was missing — the export only contained
            // auth-schema rows. Now we aggregate PII from all modules.
            var crossSchemaData = await dataAggregator.AggregateAsync(userId, cancellationToken);

            // ── 3. Assemble the complete bundle ─────────────────────────────────
            var bundle = new
            {
                ExportedAt    = DateTime.UtcNow,
                ExportVersion = "2.0",   // bump from "1.0" (auth-only) to document the schema extension
                UserId        = userId,

                // Auth schema
                Auth = new
                {
                    User               = user,
                    Profile            = profile,
                    Consents           = consents,
                    DataCorrectionRequests = correctionRequests,
                },

                // DG-SEC-04: financial + communication data
                Documents      = crossSchemaData.Documents,
                GstReturns     = crossSchemaData.GstReturns,
                LoanApplications = crossSchemaData.LoanApplications,
                ItrFilings     = crossSchemaData.ItrFilings,
                JournalEntries = crossSchemaData.JournalEntries,
                ChatThreads    = crossSchemaData.ChatThreads,
                Callbacks      = crossSchemaData.Callbacks,
            };

            var json = JsonSerializer.Serialize(bundle, JsonOptions);

            // ── 4. Upload to GCS and generate a signed URL ──────────────────────
            // DG-SEC-04: previously this was a placeholder gcsPath + fabricated URL.
            // Now we perform a real GCS upload (dev fallback: local temp dir).
            var (gcsPath, signedUrl, expiresAt) =
                await storageService.UploadAndSignAsync(userId, requestId, json, cancellationToken);

            exportRequest.MarkReady(gcsPath, signedUrl, expiresAt);
            await db.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "DataExportJob: DPDP export complete for request {RequestId} (user {UserId}). " +
                "GCS path: {GcsPath}, URL expires: {ExpiresAt:u}.",
                requestId, userId, gcsPath, expiresAt);
        }
        catch (Exception ex)
        {
            exportRequest.MarkFailed(ex.Message);
            await db.SaveChangesAsync(cancellationToken);

            logger.LogError(ex,
                "DataExportJob: export failed for request {RequestId} (user {UserId}).",
                requestId, userId);

            throw;   // re-throw so Hangfire records the job as failed (not succeeded)
        }
    }
}
