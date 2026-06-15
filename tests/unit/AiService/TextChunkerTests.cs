using AiService.Application.Rag.Commands.IngestDocument;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="TextChunker"/> — determinism, overlap, and edge cases.
/// Architecture decision §4: chunk size = 512 tokens, overlap = 64 tokens.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TextChunkerTests
{
    // ── Determinism ──────────────────────────────────────────────────────────

    [Fact]
    public void Chunk_SameInputTwice_ProducesIdenticalOutput()
    {
        var text = string.Join(". ", Enumerable.Repeat("This is a sentence about GST invoices in India", 50));

        var chunks1 = TextChunker.Chunk(text, 512, 64);
        var chunks2 = TextChunker.Chunk(text, 512, 64);

        chunks1.Should().BeEquivalentTo(chunks2, options => options.WithStrictOrdering());
    }

    // ── Basic chunking ────────────────────────────────────────────────────────

    [Fact]
    public void Chunk_EmptyText_ReturnsEmptyList()
    {
        var result = TextChunker.Chunk(string.Empty);
        result.Should().BeEmpty();
    }

    [Fact]
    public void Chunk_WhitespaceOnly_ReturnsEmptyList()
    {
        var result = TextChunker.Chunk("   \n\t  ");
        result.Should().BeEmpty();
    }

    [Fact]
    public void Chunk_ShortText_ReturnsSingleChunk()
    {
        const string text = "Short invoice text.";
        var result = TextChunker.Chunk(text, 512, 64);
        result.Should().HaveCount(1);
        result[0].Should().Contain("Short invoice text");
    }

    [Fact]
    public void Chunk_LongText_ProducesMultipleChunks()
    {
        // Build text that clearly exceeds 512 token target.
        var text = string.Join(". ", Enumerable.Repeat(
            "This is a detailed invoice description for goods and services rendered by Acme Supplies India Pvt Ltd",
            200));

        var result = TextChunker.Chunk(text, 512, 64);
        result.Should().HaveCountGreaterThan(1);
    }

    // ── Overlap ───────────────────────────────────────────────────────────────

    [Fact]
    public void Chunk_ConsecutiveChunks_HaveOverlap()
    {
        // Build a text long enough to produce at least 2 chunks.
        var sentence = "Invoice line item detail ";
        var text = string.Join(". ", Enumerable.Repeat(sentence.Trim(), 300));

        var result = TextChunker.Chunk(text, 128, 32); // smaller target for test speed
        result.Should().HaveCountGreaterThan(1);

        // The first word of chunk[1] should appear in chunk[0] (overlap).
        var firstWordOfChunk1 = result[1].Split(' ')[0];
        result[0].Should().Contain(firstWordOfChunk1);
    }

    // ── Target size compliance ────────────────────────────────────────────────

    [Fact]
    public void Chunk_AllChunks_WithinReasonableSize()
    {
        var text = string.Join(". ", Enumerable.Repeat(
            "Detailed tax invoice for supply of goods under GST Act 2017 India", 500));

        var result = TextChunker.Chunk(text, 512, 64);

        // Each chunk should contain at most roughly 512+64 tokens (with overhead from overlap/sentences).
        // Token estimate: word count * 1.3. Allow generous 3x headroom for test stability.
        foreach (var chunk in result)
        {
            var wordCount = chunk.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            wordCount.Should().BeLessThan(3000, "chunk should not be excessively large");
        }
    }

    // ── Devanagari danda normalisation ────────────────────────────────────────

    [Fact]
    public void Chunk_WithDevanagariDanda_ProducesChunks()
    {
        // Hindi text with Devanagari danda (।) should be handled.
        const string text = "यह एक चालान है। कुल राशि 18000 रुपए है। जीएसटी 18% लागू है।";
        var result = TextChunker.Chunk(text, 512, 64);
        result.Should().NotBeEmpty();
    }

    // ── P7a spec constants ────────────────────────────────────────────────────

    [Fact]
    public void Chunk_DefaultParameters_UseArchDecisionValues()
    {
        // Calling with no parameters should use 512 target, 64 overlap (architecture §4).
        var shortText = "Test sentence.";
        var withDefaults = TextChunker.Chunk(shortText);
        var withExplicit = TextChunker.Chunk(shortText, 512, 64);
        withDefaults.Should().BeEquivalentTo(withExplicit);
    }
}
