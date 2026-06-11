using AiService.Application.Chat.Queries.AiChat;
using AiService.Application.Extraction.Commands.ExtractFields;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace AiService.Api.Endpoints;

/// <summary>
/// All /ai endpoints — extraction, RAG-powered chat, and semantic search.
/// SEC-004: All AI endpoints require authorization.
/// SEC-011: AI endpoints rate-limited to 20 req/min per user.
/// </summary>
public sealed class Ai : EndpointGroupBase
{
    public override string? GroupName => "/ai";

    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // P7a-1: Invoice field extraction.
        // [MOCK-DEFAULT] MockAiProvider returns deterministic plausible fields in local/CI.
        // Expected latency: mock ~5ms; vertex/gemini ~1000-3000ms.
        // Token cost note: 512-token prompt + ~128-token completion; rate-limit header X-RateLimit-Remaining.
        groupBuilder.MapPost("/extract", ExtractAsync)
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("ExtractFields")
            .WithSummary("Extract structured fields from an invoice or document (P7a)")
            .WithDescription(
                "Resolves provider+model from admin AI config (per-feature override aware). " +
                "PAN/Aadhaar/card redacted before provider call (SEC-AI-01). " +
                "[MOCK-DEFAULT] Returns deterministic extraction in local/CI.");

        // P7a-3: Org-scoped RAG Q&A.
        // [MOCK-DEFAULT] MockAiProvider + MockSarvamAiService in local/CI.
        // Expected latency: mock ~15ms; vertex ~2000-5000ms with retrieval.
        // Degrades gracefully when no embeddings exist for the org.
        groupBuilder.MapPost("/chat", ChatAsync)
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("AiChat")
            .WithSummary("Org-scoped RAG Q&A with Indic-language support (P7a)")
            .WithDescription(
                "Retrieves top-k chunks from ai.embeddings (scoped to caller's org), " +
                "assembles grounded prompt, and calls the configured AI provider. " +
                "Sarvam AI handles Indic-locale translation (hi, ta, te, kn, ml, mr, bn, gu, pa, or, as). " +
                "Returns 'ingestion not ready' message when no embeddings exist. " +
                "[MOCK-DEFAULT] in local/CI.");

        // STUB: POST /ai/chat/{sessionId}/message — session continuation (P7b).
        groupBuilder.MapPost("/chat/{sessionId:guid}/message",
            (Guid sessionId) => Results.Json(new
            {
                message = "Session continuation not yet implemented.",
                roadmap = "P7b: wire ChatSession entity + conversation history.",
                sessionId,
            }, statusCode: 501))
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("AiChatMessage")
            .WithSummary("[STUB P7b] Continue an existing AI chat session");

        // STUB: POST /ai/documents/{documentId}/embed — on-demand re-embed (P7b).
        groupBuilder.MapPost("/documents/{documentId:guid}/embed",
            (Guid documentId) => Results.Json(new
            {
                message = "On-demand re-embedding not yet implemented.",
                roadmap = "P7b: trigger IngestDocumentCommand directly for a specific document.",
                documentId,
            }, statusCode: 501))
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("EmbedDocument")
            .WithSummary("[STUB P7b] Trigger on-demand re-embedding for a document");

        // STUB: POST /ai/search — semantic search across org documents (P7b).
        groupBuilder.MapPost("/search",
            () => Results.Json(new
            {
                message = "Semantic search endpoint not yet implemented.",
                roadmap = "P7b: expose top-k cosine retrieval as a search API (currently internal to /ai/chat).",
            }, statusCode: 501))
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("SemanticSearch")
            .WithSummary("[STUB P7b] Semantic search across org document embeddings");

        // STUB: POST /ai/tax-advice — GST notice reply-draft (GAP-108, P7b delivery order §4).
        groupBuilder.MapPost("/tax-advice",
            () => Results.Json(new
            {
                message = "Tax advice / GST notice reply draft not yet implemented.",
                roadmap = "GAP-108 P7b: uses chat pipeline with GST-specific system prompt + GSTN notice context.",
            }, statusCode: 501))
            .RequireAuthorization()
            .RequireRateLimiting("ai")
            .WithName("TaxAdvice")
            .WithSummary("[STUB GAP-108 P7b] GST notice reply draft via AI");
    }

    // ── Handlers ────────────────────────────────────────────────────────────

    private static async Task<IResult> ExtractAsync(
        [FromBody] ExtractRequest request,
        ISender sender,
        ICurrentUser currentUser,
        HttpContext ctx,
        CancellationToken ct)
    {
        // Parse org from JWT claim (optional — not all callers are org-scoped).
        Guid.TryParse(ctx.User.FindFirst("org_id")?.Value, out var orgId);

        var command = new ExtractFieldsCommand(
            DocumentId: request.DocumentId,
            RawText: request.RawText,
            FeatureCode: request.FeatureCode ?? "invoice_extract",
            OrganizationId: orgId == Guid.Empty ? null : orgId);

        var result = await sender.Send(command, ct);

        return result.Match(
            onSuccess: r => Results.Ok(new
            {
                fields = r.Fields,
                confidence = r.Confidence,
                provider = r.Provider,
                model = r.Model,
                latencyMs = r.LatencyMs,
            }),
            onFailure: err => err.ToHttpResult());
    }

    private static async Task<IResult> ChatAsync(
        [FromBody] ChatRequest request,
        ISender sender,
        ICurrentUser currentUser,
        HttpContext ctx,
        CancellationToken ct)
    {
        // Accept-Language header drives Indic routing.
        var locale = ctx.Request.Headers.AcceptLanguage.FirstOrDefault()?.Split(',')[0]?.Trim()
            ?? request.Locale
            ?? "en";

        // SEC-AI-02 M-03: org_id MUST come exclusively from the JWT claim — never from the
        // request body. Accepting org_id from the body created an IDOR: a user belonging to
        // Org A could supply Org B's id and retrieve Org B's RAG chunks.
        if (!Guid.TryParse(ctx.User.FindFirst("org_id")?.Value, out var orgId) || orgId == Guid.Empty)
            return Results.Problem("organizationId is required for /ai/chat — must be present in JWT claims.", statusCode: 400);

        var query = new AiChatQuery(
            Message: request.Message,
            OrganizationId: orgId,
            SessionId: request.SessionId,
            Locale: locale,
            TopK: request.TopK ?? 5);

        var result = await sender.Send(query, ct);

        return result.Match(
            onSuccess: r => Results.Ok(new
            {
                answer = r.Answer,
                sourceChunkCount = r.SourceChunkCount,
                provider = r.Provider,
                model = r.Model,
                latencyMs = r.LatencyMs,
            }),
            onFailure: err => err.Code == "Ai.DailyBudgetExceeded"
                ? Results.Json(new { error = err.Message, code = err.Code }, statusCode: 429)
                : err.ToHttpResult());
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>Request body for POST /ai/extract.</summary>
internal sealed record ExtractRequest(
    Guid? DocumentId,
    string? RawText,
    string? FeatureCode);

/// <summary>
/// Request body for POST /ai/chat.
/// SEC-AI-02 M-03: OrganizationId is intentionally absent — it is derived exclusively
/// from the JWT <c>org_id</c> claim at the endpoint level to prevent IDOR attacks.
/// </summary>
internal sealed record ChatRequest(
    string Message,
    Guid? SessionId,
    string? Locale,
    int? TopK);
