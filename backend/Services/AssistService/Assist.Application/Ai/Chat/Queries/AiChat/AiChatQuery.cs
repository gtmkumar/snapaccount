using FluentValidation;
using SnapAccount.Shared.Application;

namespace AiService.Application.Chat.Queries.AiChat;

/// <summary>
/// Org-scoped RAG Q&amp;A: retrieves top-k chunks from <c>ai.embeddings</c> for the
/// caller's org, assembles a grounded prompt, and calls the configured AI provider.
/// Sarvam AI is used for Indic-locale routing (hi, ta, te, kn, ml, mr, bn, gu, pa, or, as).
/// </summary>
/// <param name="Message">User's question (plain text, pre-redaction happens in the handler).</param>
/// <param name="OrganizationId">Caller's organisation — used to scope the embedding search.</param>
/// <param name="SessionId">Optional session identifier for conversation continuity (P7b).</param>
/// <param name="Locale">Accept-Language locale (e.g. "en", "hi", "ta"). Drives Sarvam routing.</param>
/// <param name="TopK">Number of context chunks to retrieve (default 5, max 10).</param>
public record AiChatQuery(
    string Message,
    Guid OrganizationId,
    Guid? SessionId,
    string Locale,
    int TopK = 5) : IQuery<ChatResponse>;

/// <summary>Chat response DTO returned to the API layer.</summary>
public record ChatResponse(
    string Answer,
    int SourceChunkCount,
    string Provider,
    string Model,
    int LatencyMs);

/// <summary>FluentValidation for <see cref="AiChatQuery"/>.</summary>
public sealed class AiChatQueryValidator : AbstractValidator<AiChatQuery>
{
    private const int MaxMessageLength = 2_000;

    public AiChatQueryValidator()
    {
        RuleFor(x => x.Message)
            .NotEmpty().WithMessage("message is required.")
            .MaximumLength(MaxMessageLength)
            .WithMessage($"message must be ≤ {MaxMessageLength} characters (token cost guardrail).");

        RuleFor(x => x.OrganizationId)
            .NotEmpty().WithMessage("organizationId is required.");

        RuleFor(x => x.TopK)
            .InclusiveBetween(1, 10).WithMessage("topK must be between 1 and 10.");
    }
}
