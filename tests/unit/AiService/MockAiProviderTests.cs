using AiService.Infrastructure.Providers;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="MockAiProvider"/> — determinism, expected field shapes,
/// and 768-dim vector consistency.
/// </summary>
[Trait("Category", "Unit")]
public sealed class MockAiProviderTests
{
    private readonly MockAiProvider _provider = new(NullLogger<MockAiProvider>.Instance);

    // ── ExtractFields ─────────────────────────────────────────────────────────

    [Fact]
    public async Task ExtractFields_ReturnsDeterministicPlausibleFields()
    {
        var result = await _provider.ExtractFieldsAsync("some invoice text", "invoice_extract");

        result.IsSuccess.Should().BeTrue();
        result.Value.Fields.Should().ContainKey("vendor_name");
        result.Value.Fields.Should().ContainKey("amount");
        result.Value.Fields.Should().ContainKey("gstin");
        result.Value.Fields.Should().ContainKey("invoice_number");
        result.Value.Fields.Should().ContainKey("gst_rate");
        result.Value.Confidence.Should().BeGreaterThan(0).And.BeLessOrEqualTo(1);
        result.Value.Provider.Should().Be("mock");
    }

    [Fact]
    public async Task ExtractFields_SameInput_SameOutput()
    {
        var r1 = await _provider.ExtractFieldsAsync("invoice text ABC", "invoice_extract");
        var r2 = await _provider.ExtractFieldsAsync("invoice text ABC", "invoice_extract");

        r1.Value.Fields.Should().BeEquivalentTo(r2.Value.Fields);
        r1.Value.Confidence.Should().Be(r2.Value.Confidence);
    }

    [Fact]
    public async Task ExtractFields_InputTokens_AreZeroForMock()
    {
        var result = await _provider.ExtractFieldsAsync("test", "invoice_extract");
        result.Value.InputTokens.Should().Be(0);
        result.Value.OutputTokens.Should().Be(0);
    }

    // ── Chat ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Chat_WithContextChunks_MentionsChunkCount()
    {
        var chunks = new[] { "chunk 1 content", "chunk 2 content" };
        var result = await _provider.ChatAsync("What is the GST rate?", chunks, "en");

        result.IsSuccess.Should().BeTrue();
        result.Value.Answer.Should().Contain("2");
        result.Value.SourceChunkCount.Should().Be(2);
        result.Value.Provider.Should().Be("mock");
    }

    [Fact]
    public async Task Chat_WithNoContextChunks_ReturnsIngestionNotReadyMessage()
    {
        var result = await _provider.ChatAsync("What is my balance?", [], "en");

        result.IsSuccess.Should().BeTrue();
        result.Value.Answer.Should().Contain("No document context");
        result.Value.SourceChunkCount.Should().Be(0);
    }

    // ── Embed ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Embed_Returns768DimVector()
    {
        var result = await _provider.EmbedAsync("test embedding text");

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(768);
    }

    [Fact]
    public async Task Embed_SameInput_ProducesSameVector()
    {
        const string text = "deterministic embedding test";
        var r1 = await _provider.EmbedAsync(text);
        var r2 = await _provider.EmbedAsync(text);

        r1.Value.Should().BeEquivalentTo(r2.Value);
    }

    [Fact]
    public async Task Embed_DifferentInput_ProducesDifferentVectors()
    {
        var r1 = await _provider.EmbedAsync("first text about GST");
        var r2 = await _provider.EmbedAsync("second text about income tax");

        r1.Value.Should().NotBeEquivalentTo(r2.Value);
    }

    [Fact]
    public async Task Embed_VectorIsApproximatelyUnitLength()
    {
        var result = await _provider.EmbedAsync("unit vector test");

        double magnitude = Math.Sqrt(result.Value.Sum(v => (double)v * v));
        magnitude.Should().BeApproximately(1.0, 0.001, "mock vector should be unit-normalised");
    }
}
