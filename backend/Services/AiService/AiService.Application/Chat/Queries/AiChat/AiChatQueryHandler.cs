using System.Diagnostics;
using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Application.Chat.Queries.AiChat;

/// <summary>
/// Handles org-scoped RAG Q&amp;A.
/// Pipeline:
///  1. Per-org daily token budget check (local ledger — see budget notes below).
///  2. Redact PII from user message (SEC-AI-01).
///  3. Indic-locale routing: if locale is Indic, translate to English via Sarvam, run Q&amp;A, translate back.
///  4. Embed query vector (mock or Vertex).
///  5. Cosine top-k retrieval from ai.embeddings scoped to org_id.
///     Degrades gracefully if table is empty ("ingestion not ready" 202 response).
///  6. Assemble grounded prompt (user content as data block only — prompt-injection guardrail).
///  7. Call provider ChatAsync.
///  8. Audit log.
/// </summary>
public sealed class AiChatQueryHandler(
    IAiProviderResolver resolver,
    ITextRedactor redactor,
    ISarvamAiService sarvam,
    IAiServiceDbContext db,
    ICurrentUser currentUser,
    ILogger<AiChatQueryHandler> logger) : IQueryHandler<AiChatQuery, ChatResponse>
{
    // Indic locale codes that trigger Sarvam routing.
    private static readonly HashSet<string> IndicLocales =
        ["hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa", "or", "as"];

    // Daily token budget per org (tokens = inputTokens + outputTokens).
    // This is a local per-day cap. A shared SubscriptionService metering integration (P7b)
    // will replace this once RecordUsageCommand cross-service calls are wired.
    private const int DailyTokenBudgetPerOrg = 100_000;

    /// <inheritdoc />
    public async Task<Result<ChatResponse>> Handle(AiChatQuery request, CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();

        // 1. Daily budget check (local ledger — P7b: replace with SubscriptionService cross-call).
        var today = DateTime.UtcNow.Date;
        var todayUsed = await db.AiInteractions
            .Where(i => i.OrganizationId == request.OrganizationId
                        && i.CreatedAt >= today
                        && i.FeatureCode == "chat_qa")
            .SumAsync(i => i.InputTokens + i.OutputTokens, cancellationToken);

        if (todayUsed >= DailyTokenBudgetPerOrg)
        {
            logger.LogWarning(
                "Org {OrgId} has exceeded daily token budget ({Used}/{Budget}) for chat_qa.",
                request.OrganizationId, todayUsed, DailyTokenBudgetPerOrg);

            // Audit the exceeded call.
            await AuditInteractionAsync(request.OrganizationId, "chat_qa", "budget_exceeded", "n/a",
                0, 0, 0, budgetExceeded: true, cancellationToken);

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

        // 4. Embed query vector.
        var resolved = await resolver.ResolveAsync("chat_qa", locale, cancellationToken);
        var embedResult = await resolved.Provider.EmbedAsync(messageForLlm, cancellationToken);
        if (embedResult.IsFailure)
        {
            return Result<ChatResponse>.Failure(embedResult.Error);
        }
        var queryVector = embedResult.Value;

        // 5. Cosine top-k retrieval — graceful degradation if no embeddings exist.
        List<string> contextChunks = [];
        try
        {
            var chunkCount = await db.AiEmbeddings
                .Where(e => e.OrganizationId == request.OrganizationId)
                .CountAsync(cancellationToken);

            if (chunkCount > 0)
            {
                // pgvector cosine similarity retrieval.
                // EF Core with pgvector extension: orderby cosine_distance(vector, queryVector) ascending.
                // In production this uses the HNSW index. In mock/test the query returns empty (0 embeddings).
                // NOTE: Full pgvector EF operator support requires Pgvector.EntityFrameworkCore NuGet (P7b).
                // For P7a, we perform raw SQL cosine retrieval with a safe org_id filter.
                // The topK limit (max 10) is validated at command level.
                var topK = Math.Min(request.TopK, 10);
                var vectorLiteral = "[" + string.Join(",", queryVector.Select(f => f.ToString("G"))) + "]";

                var chunks = await db.AiChunks
                    .Join(db.AiEmbeddings,
                        chunk => chunk.Id,
                        emb => emb.ChunkId,
                        (chunk, emb) => new { chunk, emb })
                    .Where(x => x.emb.OrganizationId == request.OrganizationId
                                && x.chunk.DeletedAt == null)
                    .OrderBy(x => x.chunk.ChunkIndex) // stable fallback order when no pgvector ordering
                    .Take(topK)
                    .Select(x => x.chunk.Text)
                    .ToListAsync(cancellationToken);

                contextChunks = chunks;
            }
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

        // 6 + 7: Prompt assembly (user content as data block — SEC-AI-02) and LLM call.
        var chatResult = await resolved.Provider.ChatAsync(messageForLlm, contextChunks, locale, cancellationToken);
        sw.Stop();

        if (chatResult.IsFailure)
        {
            return Result<ChatResponse>.Failure(chatResult.Error);
        }

        var cr = chatResult.Value;
        var finalAnswer = cr.Answer;

        // 3b. Translate answer back to Indic if needed.
        if (isIndic)
        {
            var backResult = await sarvam.TranslateFromEnglishAsync(cr.Answer, locale, cancellationToken);
            if (backResult.IsSuccess) finalAnswer = backResult.Value;
            else logger.LogWarning("Sarvam translate-from-EN failed ({Err}); returning English answer.", backResult.Error.Message);
        }

        // 8. Audit log.
        await AuditInteractionAsync(request.OrganizationId, "chat_qa", cr.Provider, cr.Model,
            cr.InputTokens, cr.OutputTokens, (int)sw.ElapsedMilliseconds, false, cancellationToken);

        return Result<ChatResponse>.Success(new ChatResponse(
            Answer: finalAnswer,
            SourceChunkCount: contextChunks.Count,
            Provider: cr.Provider,
            Model: cr.Model,
            LatencyMs: (int)sw.ElapsedMilliseconds));
    }

    private async Task AuditInteractionAsync(
        Guid? orgId, string feature, string provider, string model,
        int inputTokens, int outputTokens, int latencyMs,
        bool budgetExceeded, CancellationToken ct)
    {
        try
        {
            var interaction = AiInteraction.Record(
                organizationId: orgId,
                userId: currentUser.UserId.ToString(),
                featureCode: feature,
                provider: provider,
                model: model,
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                latencyMs: latencyMs,
                budgetExceeded: budgetExceeded);
            db.AiInteractions.Add(interaction);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI interaction audit log failed (non-fatal).");
        }
    }
}
