namespace AiService.Application.Rag.Commands.IngestDocument;

/// <summary>
/// Splits text into overlapping chunks for RAG ingestion.
/// Strategy: split on sentence boundaries (". ", "। ", "\n") then group until the
/// token target is reached. Overlap is achieved by carrying the last N tokens of
/// one chunk as the first N tokens of the next.
///
/// Token approximation: whitespace-split word count × 1.3 (GPT-style rough estimate).
/// This avoids a BPE tokeniser dependency while staying within ±15% of actual counts
/// for Indian-language business text.
///
/// Architecture decision §4: chunk size = 512 tokens, overlap = 64 tokens.
/// </summary>
public static class TextChunker
{
    /// <summary>
    /// Splits <paramref name="text"/> into overlapping chunks.
    /// </summary>
    /// <param name="text">Input text (full document OCR text).</param>
    /// <param name="targetTokens">Approximate token count per chunk (default 512).</param>
    /// <param name="overlapTokens">Token overlap between consecutive chunks (default 64).</param>
    /// <returns>Ordered list of chunk strings.</returns>
    public static List<string> Chunk(string text, int targetTokens = 512, int overlapTokens = 64)
    {
        if (string.IsNullOrWhiteSpace(text))
            return [];

        // Split into sentences / logical units.
        var sentences = SplitSentences(text);
        if (sentences.Count == 0)
            return [];

        var chunks = new List<string>();
        var currentWords = new List<string>();
        int currentTokens = 0;

        // Compute overlap word count: overlapTokens / 1.3 ≈ words.
        int overlapWords = (int)Math.Ceiling(overlapTokens / 1.3);

        foreach (var sentence in sentences)
        {
            var sentenceWords = sentence.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            int sentenceTokens = EstimateTokens(sentenceWords.Length);

            if (currentTokens + sentenceTokens > targetTokens && currentWords.Count > 0)
            {
                // Flush current chunk.
                chunks.Add(string.Join(" ", currentWords));

                // Carry overlap: last overlapWords words become the start of the next chunk.
                var overlapSlice = currentWords.Count > overlapWords
                    ? currentWords.GetRange(currentWords.Count - overlapWords, overlapWords)
                    : new List<string>(currentWords);

                currentWords = overlapSlice;
                currentTokens = EstimateTokens(currentWords.Count);
            }

            currentWords.AddRange(sentenceWords);
            currentTokens += sentenceTokens;
        }

        // Flush remaining words as final chunk.
        if (currentWords.Count > 0)
            chunks.Add(string.Join(" ", currentWords));

        return chunks;
    }

    private static List<string> SplitSentences(string text)
    {
        // Sentence delimiters: English ". ", Devanagari "। ", newline sequences.
        var raw = text
            .Replace("\r\n", "\n")
            .Replace("। ", ".\n") // Devanagari danda → normalise to newline boundary
            .Split([". ", "\n", "\r"], StringSplitOptions.RemoveEmptyEntries);

        return [.. raw.Select(s => s.Trim()).Where(s => s.Length > 0)];
    }

    private static int EstimateTokens(int wordCount)
        => (int)Math.Ceiling(wordCount * 1.3);
}
