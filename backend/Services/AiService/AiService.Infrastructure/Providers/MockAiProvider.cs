using AiService.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace AiService.Infrastructure.Providers;

/// <summary>
/// Mock AI provider — default in DI (same pattern as MockRazorpayClient / MockGstnApiClient).
/// Returns deterministic, plausible responses for all AI operations.
/// No HTTP calls, no GCP credentials required. Safe for local dev and CI.
/// </summary>
public sealed class MockAiProvider(ILogger<MockAiProvider> logger) : IAiProvider
{
    /// <inheritdoc />
    public string ProviderId => "mock";

    /// <inheritdoc />
    public Task<Result<ExtractionResult>> ExtractFieldsAsync(
        string text, string featureCode, CancellationToken ct = default)
    {
        logger.LogWarning(
            "[MOCK] ExtractFields called (featureCode={Feature}, textLen={Len}). " +
            "No real AI call will be made.", featureCode, text.Length);

        // Deterministic plausible invoice fields for local/CI testing.
        var fields = new Dictionary<string, string>
        {
            ["vendor_name"] = "Acme Supplies Pvt Ltd",
            ["amount"] = "18000.00",
            ["document_date"] = "2026-04-01",
            ["gstin"] = "27AABCU9603R1ZX",
            ["invoice_number"] = "INV-MOCK-0001",
            ["gst_rate"] = "18",
            ["hsn_code"] = "9983",
            ["place_of_supply"] = "Maharashtra",
        };

        var result = new ExtractionResult(
            Fields: fields,
            Confidence: 0.92m,
            Provider: "mock",
            Model: "mock-extraction-v1",
            InputTokens: 0,
            OutputTokens: 0,
            LatencyMs: 5);

        return Task.FromResult(Result<ExtractionResult>.Success(result));
    }

    /// <inheritdoc />
    public Task<Result<ChatResult>> ChatAsync(
        string userMessage, IReadOnlyList<string> contextChunks, string locale, CancellationToken ct = default)
    {
        logger.LogWarning(
            "[MOCK] Chat called (locale={Locale}, chunks={ChunkCount}). " +
            "No real AI call will be made.", locale, contextChunks.Count);

        var answer = contextChunks.Count > 0
            ? $"[MOCK] Based on {contextChunks.Count} document chunk(s): " +
              "Your query has been processed. In production this would return a real Gemini response."
            : "[MOCK] No document context found for your organisation. " +
              "Please upload and approve documents first to enable RAG-powered answers.";

        var result = new ChatResult(
            Answer: answer,
            SourceChunkCount: contextChunks.Count,
            Provider: "mock",
            Model: "mock-chat-v1",
            InputTokens: 0,
            OutputTokens: 0,
            LatencyMs: 10);

        return Task.FromResult(Result<ChatResult>.Success(result));
    }

    /// <inheritdoc />
    public Task<Result<float[]>> EmbedAsync(string text, CancellationToken ct = default)
    {
        logger.LogDebug("[MOCK] Embed called (textLen={Len}).", text.Length);

        // Deterministic mock: hash the text into a 768-dim unit vector.
        // Same input always produces the same vector (deterministic for tests).
        var hash = text.GetHashCode();
        var rng = new Random(hash);
        var vector = new float[768];
        double magnitude = 0;
        for (var i = 0; i < 768; i++)
        {
            vector[i] = (float)(rng.NextDouble() * 2 - 1);
            magnitude += vector[i] * vector[i];
        }
        magnitude = Math.Sqrt(magnitude);
        if (magnitude > 0)
            for (var i = 0; i < 768; i++)
                vector[i] = (float)(vector[i] / magnitude);

        return Task.FromResult(Result<float[]>.Success(vector));
    }
}
