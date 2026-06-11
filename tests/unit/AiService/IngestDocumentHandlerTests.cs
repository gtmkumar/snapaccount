using AiService.Application.Common.Interfaces;
using AiService.Application.Rag.Commands.IngestDocument;
using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="IngestDocumentCommandHandler"/> —
/// chunking, embedding, idempotency, and graceful failure handling.
/// </summary>
[Trait("Category", "Unit")]
public sealed class IngestDocumentHandlerTests
{
    private static IAiProviderResolver BuildMockResolver()
    {
        var mock = new AiService.Infrastructure.Providers.MockAiProvider(
            NullLogger<AiService.Infrastructure.Providers.MockAiProvider>.Instance);
        var resolverMock = new Mock<IAiProviderResolver>();
        resolverMock
            .Setup(r => r.ResolveAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ResolvedProvider(mock, "mock-v1"));
        return resolverMock.Object;
    }

    private static TestAiDbContext BuildDb()
    {
        var options = new DbContextOptionsBuilder<TestAiDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new TestAiDbContext(options);
    }

    [Fact]
    public async Task Handle_ValidOcrText_ProducesChunksAndEmbeddings()
    {
        var db = BuildDb();
        var handler = new IngestDocumentCommandHandler(
            BuildMockResolver(), db, NullLogger<IngestDocumentCommandHandler>.Instance);

        var orgId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var ocrText = string.Join(". ",
            Enumerable.Repeat("This is an invoice line item for GST goods and services", 20));

        var cmd = new IngestDocumentCommand(docId, orgId, ocrText);
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        db.AiChunks.Should().NotBeEmpty();
        db.AiEmbeddings.Should().NotBeEmpty();
        db.AiChunks.Count().Should().Be(db.AiEmbeddings.Count(), "each chunk gets exactly one embedding");
        db.AiChunks.All(c => c.DocumentId == docId).Should().BeTrue();
        db.AiChunks.All(c => c.OrganizationId == orgId).Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ShortText_ProducesSingleChunk()
    {
        var db = BuildDb();
        var handler = new IngestDocumentCommandHandler(
            BuildMockResolver(), db, NullLogger<IngestDocumentCommandHandler>.Instance);

        var cmd = new IngestDocumentCommand(Guid.NewGuid(), Guid.NewGuid(), "Short invoice text.");
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        db.AiChunks.Should().HaveCount(1);
    }

    [Fact]
    public async Task Handle_Idempotency_SecondIngestReplacesFirst()
    {
        var db = BuildDb();
        var handler = new IngestDocumentCommandHandler(
            BuildMockResolver(), db, NullLogger<IngestDocumentCommandHandler>.Instance);

        var docId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        var ocrText = string.Join(". ",
            Enumerable.Repeat("Invoice data for idempotency test", 10));

        var cmd = new IngestDocumentCommand(docId, orgId, ocrText);

        // Ingest twice.
        await handler.Handle(cmd, CancellationToken.None);
        var countAfterFirst = db.AiChunks.Count();

        await handler.Handle(cmd, CancellationToken.None);
        var countAfterSecond = db.AiChunks.Count();

        // Count should be the same after second ingest (old chunks replaced).
        countAfterSecond.Should().Be(countAfterFirst, "idempotent re-ingest replaces old chunks");
    }

    [Fact]
    public async Task Handle_EmptyOcrText_SucceedsWithNoChunks()
    {
        // The validator would reject empty text, but the handler itself should degrade gracefully.
        var db = BuildDb();
        var handler = new IngestDocumentCommandHandler(
            BuildMockResolver(), db, NullLogger<IngestDocumentCommandHandler>.Instance);

        // Bypass validator by calling handler directly with whitespace.
        var cmd = new IngestDocumentCommand(Guid.NewGuid(), Guid.NewGuid(), "   ");
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        db.AiChunks.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_ChunkIndex_IsSequential()
    {
        var db = BuildDb();
        var handler = new IngestDocumentCommandHandler(
            BuildMockResolver(), db, NullLogger<IngestDocumentCommandHandler>.Instance);

        var ocrText = string.Join(". ",
            Enumerable.Repeat("Detailed invoice line for chunk index test scenario", 100));

        var cmd = new IngestDocumentCommand(Guid.NewGuid(), Guid.NewGuid(), ocrText);
        await handler.Handle(cmd, CancellationToken.None);

        var indices = db.AiChunks.Select(c => c.ChunkIndex).OrderBy(i => i).ToList();
        indices.Should().BeEquivalentTo(Enumerable.Range(0, indices.Count));
    }
}
