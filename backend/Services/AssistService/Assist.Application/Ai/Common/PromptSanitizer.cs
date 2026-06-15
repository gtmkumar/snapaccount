using System.Text.RegularExpressions;

namespace AiService.Application.Common;

/// <summary>
/// Utility for sanitising text before it is stored in the RAG index or sent to an AI provider.
/// SEC-AI-02 M-02: Prevents prompt-injection attacks via adversarial documents.
/// </summary>
public static partial class PromptSanitizer
{
    // Matches lines that start with three or more dashes — the delimiter pattern used in our
    // VertexAiProvider prompt templates. Replaced with "- - -" to preserve visual structure
    // without breaking the structural framing.
    [GeneratedRegex(@"^---[^\n]*$", RegexOptions.Multiline)]
    private static partial Regex DelimiterLinePattern();

    /// <summary>
    /// Escapes lines that match the structural delimiter pattern (<c>^---...</c>) in
    /// <paramref name="text"/> by replacing <c>---</c> with <c>- - -</c>.
    /// Called at RAG ingest time so that adversarial document content cannot break the
    /// <c>VertexAiProvider</c> prompt framing.
    /// </summary>
    public static string EscapeDelimiters(string text)
        => DelimiterLinePattern().Replace(text, match => match.Value.Replace("---", "- - -"));
}
