using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Domain.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LoanService.Infrastructure.Webhooks;

/// <summary>
/// P6-HANDOFF-33: Handles incoming disbursement webhook from partner banks.
///
/// Security controls:
///   1. HMAC-SHA256 signature verification with CryptographicOperations.FixedTimeEquals
///   2. Idempotency key deduplication with 30-day TTL (loan.webhook_idempotency_keys table)
///   3. On valid: update application status → DISBURSED, publish LoanDisbursedEvent
///
/// Called from the endpoint: POST /loans/webhooks/{bankId}/disbursement
/// </summary>
public sealed class DisbursementWebhookHandler(
    ILoanServiceDbContext db,
    ICredentialEncryptionService credentialEncryption,
    ILoanEventPublisher pubSubPublisher,
    ILogger<DisbursementWebhookHandler> logger)
{
    private const string LoanEventsTopic = "snapaccount.loan.events";

    /// <summary>
    /// Processes a disbursement webhook request.
    /// </summary>
    /// <param name="bankId">Bank ID from the URL path.</param>
    /// <param name="idempotencyKey">Value of the X-Idempotency-Key header.</param>
    /// <param name="signature">Value of the X-Signature header (HMAC-SHA256 hex).</param>
    /// <param name="rawBody">Raw request body bytes (used for signature verification).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Result indicating success or failure reason.</returns>
    public async Task<WebhookProcessingResult> ProcessAsync(
        Guid bankId,
        string idempotencyKey,
        string signature,
        byte[] rawBody,
        CancellationToken ct)
    {
        // Step 1: Look up the partner bank
        var bank = await db.PartnerBanks
            .Where(b => b.Id == bankId && b.IsActive && b.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (bank is null)
        {
            logger.LogWarning("DisbursementWebhook: Unknown bank {BankId}", bankId);
            return WebhookProcessingResult.Rejected("Unknown bank.");
        }

        // Step 2: Verify HMAC-SHA256 signature (constant-time comparison)
        // SEC-044: Hard-reject when WebhookSecretRef is not configured — the HMAC is the sole
        // trust boundary for this unauthenticated endpoint. Allowing a null secret would let
        // any caller knowing a valid bankId inject fraudulent disbursements with no authentication.
        if (string.IsNullOrWhiteSpace(bank.WebhookSecretRef))
        {
            logger.LogError(
                "DisbursementWebhook: Bank {BankId} has no WebhookSecretRef configured — " +
                "rejecting webhook to prevent unauthenticated disbursement injection. " +
                "Configure a webhook secret in GCP Secret Manager and update the bank record.",
                bankId);
            return WebhookProcessingResult.Rejected("Bank webhook secret is not configured.");
        }

        var secret = await credentialEncryption.GetWebhookSecretAsync(bank.WebhookSecretRef, ct);
        var expectedHash = HMACSHA256.HashData(secret, rawBody);
        var expectedHex = Convert.ToHexString(expectedHash).ToLowerInvariant();

        byte[] expectedBytes = Encoding.UTF8.GetBytes(expectedHex);
        byte[] receivedBytes = Encoding.UTF8.GetBytes(signature.ToLowerInvariant());

        // P6-HANDOFF-33: CryptographicOperations.FixedTimeEquals prevents timing attacks
        if (receivedBytes.Length != expectedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes))
        {
            logger.LogWarning(
                "DisbursementWebhook: Invalid signature from bank {BankId}", bankId);
            return WebhookProcessingResult.Rejected("Invalid signature.");
        }

        // Step 3: Idempotency check (30-day TTL)
        var existingKey = await db.WebhookIdempotencyKeys
            .Where(k => k.BankId == bankId && k.IdempotencyKey == idempotencyKey && k.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync(ct);

        if (existingKey != null)
        {
            logger.LogInformation(
                "DisbursementWebhook: Duplicate key {Key} from bank {BankId} — acking idempotently.",
                idempotencyKey, bankId);
            return WebhookProcessingResult.AlreadyProcessed();
        }

        // Step 4: Parse payload
        DisbursementPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<DisbursementPayload>(
                rawBody, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DisbursementWebhook: Failed to parse body from bank {BankId}", bankId);
            return WebhookProcessingResult.Rejected("Invalid payload format.");
        }

        if (payload is null || payload.ApplicationId == Guid.Empty)
            return WebhookProcessingResult.Rejected("Missing application_id in payload.");

        // Step 5: Update application status
        var application = await db.LoanApplications
            .Where(a => a.Id == payload.ApplicationId && a.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (application == null)
        {
            logger.LogWarning(
                "DisbursementWebhook: Application {AppId} not found for bank {BankId}",
                payload.ApplicationId, bankId);
            return WebhookProcessingResult.Rejected("Application not found.");
        }

        // Determine event type
        var eventType = payload.EventType?.ToUpperInvariant() ?? "DISBURSED";

        if (eventType == "DISBURSED")
        {
            var fromStatus = application.Status.ToString();
            var result = application.RecordDisbursement(
                payload.DisbursedAmount ?? 0m,
                payload.BankReferenceNo ?? $"WEBHOOK-{bankId:N}");

            if (result.IsFailure)
            {
                logger.LogWarning(
                    "DisbursementWebhook: State machine rejected disbursement for app {AppId}: {Error}",
                    payload.ApplicationId, result.Error.Message);
                // Still record idempotency key and ack to prevent redelivery loops
            }
            else
            {
                // P6-HANDOFF-28: status log in same UoW
                db.ApplicationStatusLogs.Add(new ApplicationStatusLog
                {
                    ApplicationId = application.Id,
                    FromStatus = fromStatus,
                    ToStatus = application.Status.ToString(),
                    TransitionedAt = DateTime.UtcNow,
                    Notes = $"Webhook from bank {bank.Name}. Ref: {payload.BankReferenceNo}. Key: {idempotencyKey}",
                    TransitionSource = "Webhook"
                });
            }
        }
        else if (eventType == "DISBURSEMENT_FAILED")
        {
            application.RecordDisbursementFailed(payload.Reason ?? "Disbursement failed (webhook)");
        }
        else if (eventType == "DISBURSEMENT_REVERSED")
        {
            application.RecordDisbursementReversed(payload.Reason ?? "Disbursement reversed (webhook)");
        }

        // Step 6: Record idempotency key (30-day TTL)
        db.WebhookIdempotencyKeys.Add(new WebhookIdempotencyKey
        {
            IdempotencyKey = idempotencyKey,
            BankId = bankId,
            ReceivedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            ApplicationId = payload.ApplicationId
        });

        await db.SaveChangesAsync(ct);

        // Step 7: Publish event to snapaccount.loan.events (P6-HANDOFF-33, P6-HANDOFF-34)
        await pubSubPublisher.PublishAsync(LoanEventsTopic, new
        {
            EventType = eventType == "DISBURSED" ? "LoanDisbursed"
                : eventType == "DISBURSEMENT_FAILED" ? "LoanDisbursementFailed"
                : "LoanDisbursementReversed",
            ApplicationId = payload.ApplicationId,
            OrgId = application.OrgId,
            DisbursedAmount = payload.DisbursedAmount,
            BankId = bankId,
            OccurredAt = DateTime.UtcNow
        }, ct);

        logger.LogInformation(
            "DisbursementWebhook: Processed {EventType} for app {AppId} from bank {BankId}",
            eventType, payload.ApplicationId, bankId);

        return WebhookProcessingResult.Accepted();
    }

    private sealed record DisbursementPayload(
        Guid ApplicationId,
        string? EventType,
        decimal? DisbursedAmount,
        string? BankReferenceNo,
        string? Reason);
}

/// <summary>Result of webhook processing.</summary>
public sealed record WebhookProcessingResult(
    WebhookProcessingStatus Status,
    string? Reason = null)
{
    public static WebhookProcessingResult Accepted() => new(WebhookProcessingStatus.Accepted);
    public static WebhookProcessingResult AlreadyProcessed() => new(WebhookProcessingStatus.AlreadyProcessed);
    public static WebhookProcessingResult Rejected(string reason) => new(WebhookProcessingStatus.Rejected, reason);
}

/// <summary>Status of webhook processing.</summary>
public enum WebhookProcessingStatus { Accepted, AlreadyProcessed, Rejected }
