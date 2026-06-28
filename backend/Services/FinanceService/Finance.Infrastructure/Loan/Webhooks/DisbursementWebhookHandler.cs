using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Domain.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LoanService.Infrastructure.Webhooks;

/// <summary>
/// DG-LOAN-02: Handles incoming disbursement webhook from partner banks.
///
/// Security controls:
///   1. HMAC-SHA256 signature verification via X-Bank-Signature header (sha256=&lt;hex&gt; format).
///      The "sha256=" prefix is stripped before constant-time comparison.
///   2. Idempotency key deduplication with 30-day TTL (loan.webhook_idempotency_keys table).
///   3. On valid: update application status, publish to snapaccount.loan.events.
///
/// HTTP status codes per contract (docs/devops/loan-disbursement-webhook.md):
///   200 — accepted
///   400 — missing header or malformed body
///   401 — signature mismatch
///   404 — unknown bankId
///   409 — duplicate idempotency key
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
    private const string Sha256Prefix = "sha256=";

    /// <summary>
    /// Processes a disbursement webhook request.
    /// </summary>
    /// <param name="bankId">Bank ID (UUID) from the URL path.</param>
    /// <param name="idempotencyKey">Value of the X-Idempotency-Key header.</param>
    /// <param name="bankSignature">Value of the X-Bank-Signature header (format: sha256=&lt;hex&gt;).</param>
    /// <param name="rawBody">Raw request body bytes (used for signature verification).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Result indicating success or failure reason with the appropriate HTTP status code.</returns>
    public async Task<WebhookProcessingResult> ProcessAsync(
        Guid bankId,
        string idempotencyKey,
        string bankSignature,
        byte[] rawBody,
        CancellationToken ct)
    {
        // Step 1: Look up the partner bank
        // DG-LOAN-02: unknown bank → 404 Not Found (not 400)
        var bank = await db.PartnerBanks
            .Where(b => b.Id == bankId && b.IsActive && b.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (bank is null)
        {
            logger.LogWarning("DisbursementWebhook: Unknown bank {BankId}", bankId);
            return WebhookProcessingResult.NotFound("Unknown bankId.");
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
            return WebhookProcessingResult.SignatureMismatch("Bank webhook secret is not configured.");
        }

        var secret = await credentialEncryption.GetWebhookSecretAsync(bank.WebhookSecretRef, ct);
        var expectedHash = HMACSHA256.HashData(secret, rawBody);
        var expectedHex = Convert.ToHexString(expectedHash).ToLowerInvariant();

        // DG-LOAN-02: strip "sha256=" prefix from header before comparison.
        // Contract: X-Bank-Signature: sha256=<hex-digest>
        var receivedHex = bankSignature.StartsWith(Sha256Prefix, StringComparison.OrdinalIgnoreCase)
            ? bankSignature[Sha256Prefix.Length..]
            : bankSignature;

        byte[] expectedBytes = Encoding.UTF8.GetBytes(expectedHex);
        byte[] receivedBytes = Encoding.UTF8.GetBytes(receivedHex.ToLowerInvariant());

        // P6-HANDOFF-33: CryptographicOperations.FixedTimeEquals prevents timing attacks.
        // DG-LOAN-02: signature mismatch → 401 Unauthorized (not 400).
        if (receivedBytes.Length != expectedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes))
        {
            logger.LogWarning(
                "DisbursementWebhook: Invalid signature from bank {BankId}", bankId);
            return WebhookProcessingResult.SignatureMismatch("Invalid signature.");
        }

        // Step 3: Idempotency check (30-day TTL)
        // DG-LOAN-02: duplicate key → 409 Conflict with {code:DUPLICATE_EVENT,key} (not 200)
        var existingKey = await db.WebhookIdempotencyKeys
            .Where(k => k.BankId == bankId && k.IdempotencyKey == idempotencyKey && k.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync(ct);

        if (existingKey != null)
        {
            logger.LogInformation(
                "DisbursementWebhook: Duplicate key {Key} from bank {BankId}.",
                idempotencyKey, bankId);
            return WebhookProcessingResult.DuplicateKey(idempotencyKey);
        }

        // Step 4: Parse payload
        // DG-LOAN-02: fields use snake_case JSON names per contract (disbursement_id/loan_id/event_type/amount/...)
        DisbursementPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<DisbursementPayload>(
                rawBody, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DisbursementWebhook: Failed to parse body from bank {BankId}", bankId);
            return WebhookProcessingResult.BadRequest("Invalid payload format.");
        }

        // DG-LOAN-02: loan_id maps to payload.LoanId (SnapAccount application UUID)
        if (payload is null || !Guid.TryParse(payload.LoanId, out var applicationId) || applicationId == Guid.Empty)
            return WebhookProcessingResult.BadRequest("Missing or invalid loan_id in payload.");

        // Step 5: Resolve application
        var application = await db.LoanApplications
            .Where(a => a.Id == applicationId && a.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (application == null)
        {
            logger.LogWarning(
                "DisbursementWebhook: Application {AppId} not found for bank {BankId}",
                applicationId, bankId);
            return WebhookProcessingResult.BadRequest("Application not found.");
        }

        // Step 6: Handle by event_type
        // DG-LOAN-02: event names per contract: DISBURSED | PARTIAL | REJECTED | REVERSED
        // DG-LOAN-02: amount is in paise (integer) — divide by 100 to get rupees
        var eventType = payload.EventType?.ToUpperInvariant() ?? "DISBURSED";
        // DG-LOAN-02: amount in paise → convert to decimal rupees
        var amountRupees = payload.Amount.HasValue ? payload.Amount.Value / 100m : 0m;
        var utrNumber = payload.UtrNumber;

        if (eventType is "DISBURSED" or "PARTIAL")
        {
            var fromStatus = application.Status.ToString();
            var result = application.RecordDisbursement(
                amountRupees,
                payload.DisbursementId ?? utrNumber ?? $"WEBHOOK-{bankId:N}");

            if (result.IsFailure)
            {
                logger.LogWarning(
                    "DisbursementWebhook: State machine rejected disbursement for app {AppId}: {Error}",
                    applicationId, result.Error.Message);
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
                    Notes = $"Webhook from bank {bank.Name}. UTR: {utrNumber}. DisbursementId: {payload.DisbursementId}. Key: {idempotencyKey}. EventType: {eventType}",
                    TransitionSource = "Webhook"
                });
            }
        }
        else if (eventType == "REJECTED")
        {
            // DG-LOAN-02: REJECTED → RecordDisbursementFailed
            application.RecordDisbursementFailed(payload.FailureReason ?? "Disbursement rejected (webhook)");
        }
        else if (eventType == "REVERSED")
        {
            // DG-LOAN-02: REVERSED → RecordDisbursementReversed
            application.RecordDisbursementReversed(payload.FailureReason ?? "Disbursement reversed (webhook)");
        }
        else
        {
            logger.LogWarning(
                "DisbursementWebhook: Unrecognised event_type '{EventType}' from bank {BankId} for app {AppId} — recording idempotency key and acking.",
                eventType, bankId, applicationId);
        }

        // Step 7: Record idempotency key (30-day TTL)
        db.WebhookIdempotencyKeys.Add(new WebhookIdempotencyKey
        {
            IdempotencyKey = idempotencyKey,
            BankId = bankId,
            ReceivedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
            ApplicationId = applicationId
        });

        await db.SaveChangesAsync(ct);

        // Step 8: Publish event to snapaccount.loan.events (P6-HANDOFF-33, P6-HANDOFF-34)
        // DG-LOAN-02: published event matches documented contract (loan_id, amount, utr_number)
        var pubSubEventType = eventType switch
        {
            "DISBURSED" or "PARTIAL" => "LoanDisbursed",
            "REJECTED" => "LoanDisbursementFailed",
            "REVERSED" => "LoanDisbursementReversed",
            _ => "LoanWebhookUnknownEventType"
        };

        await pubSubPublisher.PublishAsync(LoanEventsTopic, new
        {
            event_type = pubSubEventType,
            loan_id = applicationId.ToString(),
            org_id = application.OrgId.ToString(),
            amount = payload.Amount,
            utr_number = utrNumber,
            bank_id = bankId.ToString(),
            occurred_at = DateTime.UtcNow
        }, ct);

        logger.LogInformation(
            "DisbursementWebhook: Processed {EventType} for app {AppId} from bank {BankId}",
            eventType, applicationId, bankId);

        return WebhookProcessingResult.Accepted();
    }

    /// <summary>
    /// DG-LOAN-02: Payload matching the documented contract.
    /// All fields use [JsonPropertyName] with snake_case names per docs/devops/loan-disbursement-webhook.md.
    /// </summary>
    private sealed record DisbursementPayload(
        [property: JsonPropertyName("disbursement_id")] string? DisbursementId,
        [property: JsonPropertyName("loan_id")] string? LoanId,
        [property: JsonPropertyName("event_type")] string? EventType,
        [property: JsonPropertyName("amount")] long? Amount,
        [property: JsonPropertyName("currency")] string? Currency,
        [property: JsonPropertyName("disbursed_at")] DateTime? DisbursedAt,
        [property: JsonPropertyName("utr_number")] string? UtrNumber,
        [property: JsonPropertyName("bank_account_number")] string? BankAccountNumber,
        [property: JsonPropertyName("failure_reason")] string? FailureReason);
}

/// <summary>
/// DG-LOAN-02: Result of webhook processing with fine-grained HTTP status codes
/// per the documented contract (docs/devops/loan-disbursement-webhook.md).
/// </summary>
public sealed record WebhookProcessingResult(
    WebhookProcessingStatus Status,
    string? Reason = null,
    string? ConflictKey = null)
{
    /// <summary>200 — event accepted and queued.</summary>
    public static WebhookProcessingResult Accepted() => new(WebhookProcessingStatus.Accepted);

    /// <summary>404 — bankId not recognised.</summary>
    public static WebhookProcessingResult NotFound(string reason) => new(WebhookProcessingStatus.NotFound, reason);

    /// <summary>401 — HMAC signature verification failed.</summary>
    public static WebhookProcessingResult SignatureMismatch(string reason) => new(WebhookProcessingStatus.SignatureMismatch, reason);

    /// <summary>409 — duplicate X-Idempotency-Key.</summary>
    public static WebhookProcessingResult DuplicateKey(string key) => new(WebhookProcessingStatus.DuplicateKey, null, key);

    /// <summary>400 — missing required headers or malformed body.</summary>
    public static WebhookProcessingResult BadRequest(string reason) => new(WebhookProcessingStatus.BadRequest, reason);
}

/// <summary>DG-LOAN-02: Granular processing status mapped to HTTP status codes at the endpoint layer.</summary>
public enum WebhookProcessingStatus
{
    /// <summary>200 OK — event accepted.</summary>
    Accepted,

    /// <summary>404 Not Found — unknown bankId.</summary>
    NotFound,

    /// <summary>401 Unauthorized — HMAC signature mismatch.</summary>
    SignatureMismatch,

    /// <summary>409 Conflict — duplicate idempotency key.</summary>
    DuplicateKey,

    /// <summary>400 Bad Request — missing header or malformed body.</summary>
    BadRequest
}
