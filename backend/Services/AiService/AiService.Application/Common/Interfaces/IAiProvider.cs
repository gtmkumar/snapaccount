using SnapAccount.Shared.Domain;

namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Core AI provider abstraction. Implementations:
/// <list type="bullet">
///   <item><c>MockAiProvider</c> — deterministic, GCP-free (default in local/CI)</item>
///   <item><c>VertexAiProvider</c> — Vertex AI Gemini + text-embedding-005 (production)</item>
/// </list>
/// Selected at runtime from the admin AI config fetched from AuthService
/// (GET /auth/config/ai/effective). The resolver falls back to MockAiProvider
/// when no API key is configured.
/// </summary>
public interface IAiProvider
{
    /// <summary>Identifier for this provider (e.g. "mock", "vertex").</summary>
    string ProviderId { get; }

    /// <summary>
    /// Extracts structured fields from document text or raw text.
    /// Returns a dictionary of field names → extracted string values plus confidence [0-1].
    /// </summary>
    Task<Result<ExtractionResult>> ExtractFieldsAsync(
        string text,
        string featureCode,
        CancellationToken ct = default);

    /// <summary>
    /// Generates a chat response grounded in the supplied <paramref name="contextChunks"/>
    /// using the prompt-injection guardrails in §5 of the architecture decision.
    /// </summary>
    Task<Result<ChatResult>> ChatAsync(
        string userMessage,
        IReadOnlyList<string> contextChunks,
        string locale,
        CancellationToken ct = default);

    /// <summary>
    /// Produces a 768-dimensional float vector for the given text.
    /// Used by the RAG ingestion worker. Returns a 768-element array.
    /// </summary>
    Task<Result<float[]>> EmbedAsync(string text, CancellationToken ct = default);
}

/// <summary>Result of a field-extraction call.</summary>
/// <param name="Fields">Extracted field name → value pairs.</param>
/// <param name="Confidence">Overall confidence score [0,1].</param>
/// <param name="Provider">Provider actually used.</param>
/// <param name="Model">Model actually used.</param>
/// <param name="InputTokens">Prompt tokens consumed (0 for mock).</param>
/// <param name="OutputTokens">Completion tokens produced (0 for mock).</param>
/// <param name="LatencyMs">Wall-clock latency.</param>
public record ExtractionResult(
    Dictionary<string, string> Fields,
    decimal Confidence,
    string Provider,
    string Model,
    int InputTokens,
    int OutputTokens,
    int LatencyMs);

/// <summary>Result of a chat/Q&amp;A call.</summary>
/// <param name="Answer">LLM-generated answer, already sanitised.</param>
/// <param name="SourceChunkCount">Number of retrieved context chunks used.</param>
/// <param name="Provider">Provider actually used.</param>
/// <param name="Model">Model actually used.</param>
/// <param name="InputTokens">Prompt tokens consumed.</param>
/// <param name="OutputTokens">Completion tokens produced.</param>
/// <param name="LatencyMs">Wall-clock latency.</param>
public record ChatResult(
    string Answer,
    int SourceChunkCount,
    string Provider,
    string Model,
    int InputTokens,
    int OutputTokens,
    int LatencyMs);
