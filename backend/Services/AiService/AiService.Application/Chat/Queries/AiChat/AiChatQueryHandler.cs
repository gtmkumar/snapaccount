using System.Diagnostics;
using AiService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Application.Chat.Queries.AiChat;

/// <summary>
/// Handles org-scoped RAG Q&amp;A.
/// Pipeline:
///  1. Per-org daily token budget check via RESERVATION PATTERN (RV-03 SEC-AI-02).
///  2. Redact PII from user message (SEC-AI-01).
///  3. Indic-locale routing: if locale is Indic, translate to English via Sarvam, run Q&amp;A, translate back.
///  4. Embed query vector (mock or Vertex).
///  5. Cosine top-k retrieval from ai.embeddings scoped to org_id.
///     Degrades gracefully if table is empty ("ingestion not ready" 202 response).
///  6. Assemble grounded prompt (user content as data block only — prompt-injection guardrail).
///  7. Call provider ChatAsync.
///  8. Finalise/abort reservation audit row.
/// </summary>
public sealed class AiChatQueryHandler(
    IAiProviderResolver resolver,
    ITextRedactor redactor,
    ISarvamAiService sarvam,
    IAiServiceDbContext db,
    ITokenBudgetService budgetService,
    ICurrentUser currentUser,
    ILogger<AiChatQueryHandler> logger) : IQueryHandler<AiChatQuery, ChatResponse>
{
    // Indic locale codes that trigger Sarvam routing.
    private static readonly HashSet<string> IndicLocales =
        ["hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa", "or", "as"];

    // Daily token budget per org (tokens = inputTokens + outputTokens).
    // RV-03 (SEC-AI-02): enforcement is now closed via the RESERVATION PATTERN.
    // A shared SubscriptionService metering integration (P7b) will replace this local cap.
    private const int DailyTokenBudgetPerOrg = 100_000;

    /// <inheritdoc />
    public async Task<Result<ChatResponse>> Handle(AiChatQuery request, CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var userId = currentUser.UserId.ToString();

        // 1. RV-03 RESERVATION PATTERN: acquire budget slot and insert a reservation row
        // INSIDE the advisory-lock transaction. Concurrent requests for the same org will
        // see this reservation in their daily-sum and correctly count in-progress consumption.
        var (budgetOk, reservationId) = await budgetService.TryAcquireBudgetSlotAsync(
            request.OrganizationId, userId, "chat_qa", DailyTokenBudgetPerOrg, cancellationToken);

        if (!budgetOk)
        {
            // Audit the exceeded call without a reservation row.
            await budgetService.RecordNonReservationAsync(
                request.OrganizationId, userId, "chat_qa",
                "budget_exceeded", "n/a", 0, 0, 0, budgetExceeded: true, cancellationToken);

            return Result<ChatResponse>.Failure(
                new Error("Ai.DailyBudgetExceeded",
                    "Your organisation's daily AI token budget has been reached. Try again tomorrow.",
                    ErrorType.Validation));
        }

        // 2. SEC-AI-01: Redact PII.
        var redactedMessage = redactor.Redact(request.Message);

        // 3. Indic routing: translate to English for embedding + LLM.
        var locale = request.Locale?.ToLowerInvariant() ?? "en";
        var isIndic = IndicLocales.Contains(locale);
        string messageForLlm = redactedMessage;
        if (isIndic)
        {
            var transResult = await sarvam.TranslateToEnglishAsync(redactedMessage, locale, cancellationToken);
            if (transResult.IsSuccess) messageForLlm = transResult.Value;
            else logger.LogWarning("Sarvam translate-to-EN failed ({Err}); proceeding in original locale.", transResult.Error.Message);
        }

        // FG-01 (SEC-AI-02): Wrap all post-reservation work in try/finally so AbortReservationAsync
        // is guaranteed to run — including on OperationCanceledException from a mid-flight client
        // disconnect. The abort and finalise calls use CancellationToken.None because:
        //   • On cancellation the original token is already cancelled, so passing it would
        //     prevent the abort from executing, leaking a 1000-token reservation until midnight.
        //   • The provider cost is already incurred by the time FinaliseReservationAsync is called,
        //     so it must not be skipped by a concurrent cancellation.
        Result<ChatResponse>? handlerResult = null;
        ChatResult? chatResultValue = null;
        List<string> contextChunks = [];
        string abortReason = "unknown";

        try
        {
            // 4. Embed query vector.
            var resolved = await resolver.ResolveAsync("chat_qa", locale, cancellationToken);
            var embedResult = await resolved.Provider.EmbedAsync(messageForLlm, cancellationToken);
            if (embedResult.IsFailure)
            {
                abortReason = "embed_failed";
                return handlerResult = Result<ChatResponse>.Failure(embedResult.Error);
            }

            // 5. Cosine top-k retrieval — graceful degradation if no embeddings exist.
            try
            {
                var chunkCount = await db.AiEmbeddings
                    .Where(e => e.OrganizationId == request.OrganizationId)
                    .CountAsync(cancellationToken);

                if (chunkCount > 0)
                {
                    var topK = Math.Min(request.TopK, 10);
                    var chunks = await db.AiChunks
                        .Join(db.AiEmbeddings,
                            chunk => chunk.Id,
                            emb => emb.ChunkId,
                            (chunk, emb) => new { chunk, emb })
                        .Where(x => x.emb.OrganizationId == request.OrganizationId
                                    && x.chunk.DeletedAt == null)
                        .OrderBy(x => x.chunk.ChunkIndex)
                        .Take(topK)
                        .Select(x => x.chunk.Text)
                        .ToListAsync(cancellationToken);

                    contextChunks = chunks;
                }
            }
            catch (OperationCanceledException)
            {
                // Propagate — outer finally will abort the reservation.
                throw;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Embedding retrieval failed — proceeding with empty context.");
            }

            if (contextChunks.Count == 0)
            {
                logger.LogInformation(
                    "No embeddings found for org {OrgId} — ingestion may not be complete.", request.OrganizationId);
            }

            // 6 + 7: Prompt assembly and LLM call.
            var chatResult = await resolved.Provider.ChatAsync(messageForLlm, contextChunks, locale, cancellationToken);
            sw.Stop();

            if (chatResult.IsFailure)
            {
                abortReason = chatResult.Error.Code;
                return handlerResult = Result<ChatResponse>.Failure(chatResult.Error);
            }

            chatResultValue = chatResult.Value;
            var finalAnswer = chatResultValue.Answer;

            // 3b. Translate answer back to Indic if needed.
            if (isIndic)
            {
                var backResult = await sarvam.TranslateFromEnglishAsync(chatResultValue.Answer, locale, cancellationToken);
                if (backResult.IsSuccess) finalAnswer = backResult.Value;
                else logger.LogWarning("Sarvam translate-from-EN failed ({Err}); returning English answer.", backResult.Error.Message);
            }

            return handlerResult = Result<ChatResponse>.Success(new ChatResponse(
                Answer: finalAnswer,
                SourceChunkCount: contextChunks.Count,
                Provider: chatResultValue.Provider,
                Model: chatResultValue.Model,
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
            // 8. FG-01: Finalise or abort reservation using CancellationToken.None so the audit
            // write succeeds even when the original request token has been cancelled.
            if (reservationId.HasValue)
            {
                if (handlerResult is { IsSuccess: true } && chatResultValue is not null)
                {
                    // Success path: write actual token counts.
                    await budgetService.FinaliseReservationAsync(
                        reservationId.Value, chatResultValue.Provider, chatResultValue.Model,
                        chatResultValue.InputTokens, chatResultValue.OutputTokens,
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
            else if (handlerResult is { IsSuccess: true } && chatResultValue is not null)
            {
                // Admin/null-org path: no reservation was created; write a direct record.
                await budgetService.RecordNonReservationAsync(
                    request.OrganizationId, userId, "chat_qa", chatResultValue.Provider, chatResultValue.Model,
                    chatResultValue.InputTokens, chatResultValue.OutputTokens,
                    (int)sw.ElapsedMilliseconds, false, CancellationToken.None);
            }
        }
    }
}
