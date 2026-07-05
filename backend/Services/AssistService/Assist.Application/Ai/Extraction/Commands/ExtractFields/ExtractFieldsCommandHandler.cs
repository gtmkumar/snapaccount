using System.Diagnostics;
using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Application.Extraction.Commands.ExtractFields;

/// <summary>
/// Handles invoice/document field extraction.
/// Pipeline:
///  1. RV-03 (SEC-AI-02 H-03/M-04): RESERVATION PATTERN — atomic daily token budget check
///     that inserts a placeholder row inside the advisory-lock transaction before returning.
///  2. Redact PII from rawText (SEC-AI-01).
///  3. Resolve provider from admin config (with per-feature override).
///  4. Call provider.ExtractFieldsAsync.
///  5. Finalise/abort the reservation row (actual tokens or zero on failure).
///  6. Return structured fields + confidence.
/// </summary>
public sealed class ExtractFieldsCommandHandler(
    IAiProviderResolver resolver,
    ITextRedactor redactor,
    ITokenBudgetService budgetService,
    ICurrentUser currentUser,
    ILogger<ExtractFieldsCommandHandler> logger) : ICommandHandler<ExtractFieldsCommand, ExtractionResponse>
{
    // Daily token budget for extraction calls (separate bucket from chat_qa).
    // At 640 tokens/call and 20 req/min rate limit: 640 * 20 * 60 = 768k/hr potential max.
    // SEC-AI-02 M-04: /ai/extract previously had NO budget check — this closes that gap.
    private const int DailyExtractBudgetPerOrg = 100_000;

    /// <inheritdoc />
    public async Task<Result<ExtractionResponse>> Handle(
        ExtractFieldsCommand request,
        CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var userId = currentUser.UserId.ToString();

        // 1. RV-03 RESERVATION PATTERN: insert a reservation row INSIDE the advisory-lock
        // transaction so concurrent extraction requests for the same org see each other's
        // in-progress consumption in the daily-SUM budget check.
        var (budgetOk, reservationId) = await budgetService.TryAcquireBudgetSlotAsync(
            request.OrganizationId, userId, "invoice_extract", DailyExtractBudgetPerOrg, cancellationToken);

        if (!budgetOk)
        {
            logger.LogWarning(
                "Org {OrgId} has exhausted daily extraction token budget.", request.OrganizationId);
            return Result<ExtractionResponse>.Failure(
                new Error("Ai.DailyBudgetExceeded",
                    "Your organisation's daily AI extraction budget has been reached. Try again tomorrow.",
                    ErrorType.Validation));
        }

        // 2. Decide what text to extract from.
        var text = request.RawText ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text) && request.DocumentId.HasValue)
        {
            // Abort the reservation before returning — no AI call will happen.
            // Use CancellationToken.None: the request token may already be cancelled (FG-01).
            if (reservationId.HasValue)
                await budgetService.AbortReservationAsync(reservationId.Value, "no_raw_text", CancellationToken.None);

            return Result<ExtractionResponse>.Failure(
                new Error("Ai.DocumentTextRequired",
                    "rawText must be provided in this version. Document-id-only extraction requires DocumentService integration (P7b).",
                    ErrorType.Validation));
        }

        // 3. SEC-AI-01: Redact PII before sending to the AI provider.
        var redactedText = redactor.Redact(text);

        // 4. Resolve provider (falls back to mock if not configured).
        var resolved = await resolver.ResolveAsync(request.FeatureCode, null, cancellationToken);

        // FG-01 (SEC-AI-02): Wrap the provider call in try/finally so AbortReservationAsync runs
        // on ANY non-success path — including OperationCanceledException from a mid-flight client
        // disconnect. The abort and finalise calls use CancellationToken.None because:
        //   • On cancellation the original token is already cancelled — passing it would prevent
        //     the abort from running, leaving a 1000-token reservation until UTC midnight.
        //   • The provider cost is already incurred once ExtractFieldsAsync returns; finalise
        //     must not be skipped by a concurrent cancellation.
        Result<ExtractionResponse>? handlerResult = null;
        ExtractionResult? extractionValue = null;
        string abortReason = "unknown";

        try
        {
            // 5. Extract fields.
            var extractResult = await resolved.Provider.ExtractFieldsAsync(
                redactedText, request.FeatureCode, cancellationToken);

            sw.Stop();

            if (extractResult.IsFailure)
            {
                logger.LogWarning("Extraction failed for feature {Feature}: {Error}",
                    request.FeatureCode, extractResult.Error.Message);

                abortReason = extractResult.Error.Code;
                return handlerResult = Result<ExtractionResponse>.Failure(extractResult.Error);
            }

            extractionValue = extractResult.Value;
            return handlerResult = Result<ExtractionResponse>.Success(new ExtractionResponse(
                Fields: extractionValue.Fields,
                Confidence: extractionValue.Confidence,
                Provider: extractionValue.Provider,
                Model: extractionValue.Model,
                LatencyMs: (int)sw.ElapsedMilliseconds));
        }
        catch (OperationCanceledException)
        {
            // FG-01: client disconnected mid-provider-call. Mark for abort in finally.
            abortReason = "request_cancelled";
            throw;
        }
        finally
        {
            // 6. FG-01: Finalise or abort reservation using CancellationToken.None so the audit
            // write succeeds even when the original request token has been cancelled.
            if (reservationId.HasValue)
            {
                if (handlerResult is { IsSuccess: true } && extractionValue is not null)
                {
                    // Success path: write actual token counts.
                    await budgetService.FinaliseReservationAsync(
                        reservationId.Value, extractionValue.Provider, extractionValue.Model,
                        extractionValue.InputTokens, extractionValue.OutputTokens,
                        (int)sw.ElapsedMilliseconds, CancellationToken.None);
                }
                else
                {
                    // Any non-success path (failure result OR exception): abort reservation so
                    // the failed/cancelled call does not consume the org's daily token budget.
                    await budgetService.AbortReservationAsync(
                        reservationId.Value, abortReason, CancellationToken.None);
                }
            }
            else if (handlerResult is { IsSuccess: true } && extractionValue is not null)
            {
                // Admin/null-org path: no reservation; write a direct record.
                await budgetService.RecordNonReservationAsync(
                    request.OrganizationId, userId, request.FeatureCode, extractionValue.Provider, extractionValue.Model,
                    extractionValue.InputTokens, extractionValue.OutputTokens,
                    (int)sw.ElapsedMilliseconds, false, CancellationToken.None);
            }
        }
    }
}
