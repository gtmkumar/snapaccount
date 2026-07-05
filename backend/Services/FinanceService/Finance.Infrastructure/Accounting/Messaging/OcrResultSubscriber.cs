using System.Security.Cryptography;
using System.Text.Json;
using AccountingService.Application.Interfaces;
using AccountingService.Application.JournalBatches.Commands.PostFromOcr;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;

namespace AccountingService.Infrastructure.Messaging;

/// <summary>
/// Hosted service that subscribes to the Pub/Sub topic
/// <c>snapaccount.document.ocr.completed</c> via subscription
/// <c>accounting-service-ocr-sub</c> and dispatches
/// <see cref="PostFromOcrCommand"/> for each message.
/// <para>
/// P6-HANDOFF-09: uses the correct provisioned topic/subscription names.
/// P6-HANDOFF-03: computes DedupeHash = SHA-256(document_id || extracted_payload_hash)
/// before dispatching so the partial unique index enforces idempotency.
/// </para>
/// Messages are acknowledged only after the command handler returns success
/// (or duplicate detection). On failure, the message is NACK'd and Pub/Sub
/// retries with exponential backoff.
/// </summary>
public sealed class OcrResultSubscriber(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<OcrResultSubscriber> logger) : BackgroundService
{
    // P6-HANDOFF-09: exact provisioned subscription name
    private const string DefaultSubscription = "accounting-service-ocr-sub";
    private const string DefaultProjectId = "local-dev";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectId = configuration["GCP_PROJECT_ID"] ?? DefaultProjectId;
        var subscriptionId = configuration["PUBSUB_SUBSCRIPTION_OCR"] ?? DefaultSubscription;

        logger.LogInformation(
            "OcrResultSubscriber starting — project={ProjectId} subscription={SubscriptionId}",
            projectId, subscriptionId);

        var subscriptionName = SubscriptionName.FromProjectSubscription(projectId, subscriptionId);

        SubscriberClient subscriber;
        try
        {
            subscriber = await SubscriberClient.CreateAsync(subscriptionName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Pub/Sub subscriber could not be created (emulator not running?). " +
                "OcrResultSubscriber will not process messages in this session.");
            return;
        }

        await subscriber.StartAsync(async (message, ct) =>
        {
            using var scope = scopeFactory.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();

            try
            {
                var payload = JsonSerializer.Deserialize<OcrCompletedPayload>(
                    message.Data.ToStringUtf8(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (payload is null)
                {
                    logger.LogWarning("OcrResultSubscriber received null payload — NACK");
                    return SubscriberClient.Reply.Nack;
                }

                // P6-HANDOFF-03: compute dedupe hash before dispatching
                var dedupeHash = ComputeDedupeHash(payload.DocumentId, payload.ExtractedPayloadHash);

                // SEC-037: resolve debit/credit accounts via per-org COA lookup.
                // Prior code fell back to hardcoded UUIDs (1200/4100 placeholders) which
                // could post to wrong (cross-org) accounts when DocumentService didn't
                // suggest specific accounts. Now: prefer suggestion → else look up the
                // org's "1200" / "4100" by code → else fail-loud (NACK) so Pub/Sub
                // retries and the message eventually goes to DLQ for human triage.
                var coaRepo = scope.ServiceProvider.GetRequiredService<IChartOfAccountRepository>();

                var debitAccountId = payload.SuggestedDebitAccountId
                    ?? (await coaRepo.GetByOrganizationAndCodeAsync(payload.OrgId, "1200", ct))?.Id;
                var creditAccountId = payload.SuggestedCreditAccountId
                    ?? (await coaRepo.GetByOrganizationAndCodeAsync(payload.OrgId, "4100", ct))?.Id;

                if (debitAccountId is null || creditAccountId is null)
                {
                    logger.LogError(
                        "OCR posting blocked for document {DocumentId} (org {OrgId}): " +
                        "no suggested accounts and org has no COA entry for codes 1200/4100. " +
                        "Run BootstrapCoa for the org or have DocumentService supply suggestions. NACK.",
                        payload.DocumentId, payload.OrgId);
                    return SubscriberClient.Reply.Nack;
                }

                var command = new PostFromOcrCommand(
                    OrgId: payload.OrgId,
                    DocumentId: payload.DocumentId,
                    DebitAccountId: debitAccountId.Value,
                    CreditAccountId: creditAccountId.Value,
                    Amount: payload.TotalAmount,
                    Narration: $"OCR: {payload.VendorName ?? "Unknown vendor"} — {payload.DocumentDate:yyyy-MM-dd}",
                    FyYear: IndianFyYear(payload.DocumentDate),
                    PeriodMonth: IndianPeriodMonth(payload.DocumentDate),
                    DedupeHash: dedupeHash);

                var result = await sender.Send(command, ct);

                if (result.IsSuccess)
                {
                    logger.LogInformation(
                        "OCR posting {IsDuplicate} for document {DocumentId}",
                        result.Value.WasDuplicate ? "duplicate (skipped)" : "posted",
                        payload.DocumentId);
                    return SubscriberClient.Reply.Ack;
                }

                logger.LogError("OCR posting failed for document {DocumentId}: {Error}",
                    payload.DocumentId, result.Error.Message);
                return SubscriberClient.Reply.Nack;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unhandled exception processing OCR Pub/Sub message");
                return SubscriberClient.Reply.Nack;
            }
        });

        // Wait until cancellation, then stop the subscriber gracefully
#pragma warning disable CS0618 // StopAsync(CancellationToken) overload removed in newer SDK; use ShutdownOptions overload
        stoppingToken.Register(() => subscriber.StopAsync(CancellationToken.None));
#pragma warning restore CS0618
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Computes SHA-256(document_id_bytes || extracted_payload_hash_bytes).
    /// Returns lowercase hex string (64 chars). P6-HANDOFF-03.
    /// </summary>
    private static string ComputeDedupeHash(Guid documentId, string extractedPayloadHash)
    {
        var docBytes = documentId.ToByteArray();
        var payloadBytes = System.Text.Encoding.UTF8.GetBytes(extractedPayloadHash);
        var combined = new byte[docBytes.Length + payloadBytes.Length];
        docBytes.CopyTo(combined, 0);
        payloadBytes.CopyTo(combined, docBytes.Length);
        return Convert.ToHexString(SHA256.HashData(combined)).ToLowerInvariant();
    }

    /// <summary>Indian FY year: April 2025 → 2026 (Apr is start of next FY).</summary>
    private static int IndianFyYear(DateOnly date) => date.Month >= 4 ? date.Year + 1 : date.Year;

    /// <summary>Indian FY period month: April=1, March=12.</summary>
    private static int IndianPeriodMonth(DateOnly date) => date.Month >= 4 ? date.Month - 3 : date.Month + 9;
}

/// <summary>Payload shape of the <c>snapaccount.document.ocr.completed</c> Pub/Sub message.</summary>
internal sealed class OcrCompletedPayload
{
    public Guid OrgId { get; init; }
    public Guid DocumentId { get; init; }

    /// <summary>SHA-256 or MD5 of the raw extracted JSON — used in dedupe hash computation.</summary>
    public string ExtractedPayloadHash { get; init; } = string.Empty;

    public decimal TotalAmount { get; init; }
    public string? VendorName { get; init; }
    public string? VendorGstin { get; init; }
    public DateOnly DocumentDate { get; init; }
    public string? DocumentType { get; init; } // INVOICE, RECEIPT, etc.

    /// <summary>Optional: DocumentService can suggest the debit account based on document type.</summary>
    public Guid? SuggestedDebitAccountId { get; init; }

    /// <summary>Optional: DocumentService can suggest the credit account.</summary>
    public Guid? SuggestedCreditAccountId { get; init; }
}
