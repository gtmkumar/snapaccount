using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Application.Rag.Commands.IngestDocument;

/// <summary>
/// Handles RAG ingestion: chunks the OCR text, embeds each chunk, and upserts
/// into <c>ai.chunks</c> + <c>ai.embeddings</c>.
/// Idempotent: existing chunks for the same document are deleted before re-ingesting,
/// so re-processing an approved document is safe.
/// </summary>
public sealed class IngestDocumentCommandHandler(
    IAiProviderResolver resolver,
    IAiServiceDbContext db,
    ILogger<IngestDocumentCommandHandler> logger) : ICommandHandler<IngestDocumentCommand>
{
    private const int ChunkTokenTarget = 512;
    private const int ChunkOverlapTokens = 64;

    /// <inheritdoc />
    public async Task<Result> Handle(IngestDocumentCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "RAG ingestion starting for document {DocumentId} (org {OrgId}), text length {Len}.",
            request.DocumentId, request.OrganizationId, request.OcrText.Length);

        // Idempotency: remove existing chunks for this document.
        var existing = await db.AiChunks
            .Where(c => c.DocumentId == request.DocumentId)
            .Include(c => c.Embedding)
            .ToListAsync(cancellationToken);

        if (existing.Count > 0)
        {
            var existingEmbeddings = existing.Select(c => c.Embedding).Where(e => e is not null).ToList();
            db.AiEmbeddings.RemoveRange(existingEmbeddings!);
            db.AiChunks.RemoveRange(existing);
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Removed {Count} existing chunks for document {DocumentId}.",
                existing.Count, request.DocumentId);
        }

        // 1. Chunk the text.
        var chunks = TextChunker.Chunk(request.OcrText, ChunkTokenTarget, ChunkOverlapTokens);
        if (chunks.Count == 0)
        {
            logger.LogWarning("Document {DocumentId} produced 0 chunks — nothing to ingest.", request.DocumentId);
            return Result.Success();
        }

        // 2. Resolve embedding provider.
        var resolved = await resolver.ResolveAsync("rag_embed", null, cancellationToken);
        var provider = resolved.Provider.ProviderId;
        var model = resolved.EffectiveModel;

        // 3. Embed + persist each chunk.
        var chunkIndex = 0;
        foreach (var chunkText in chunks)
        {
            var embedResult = await resolved.Provider.EmbedAsync(chunkText, cancellationToken);
            if (embedResult.IsFailure)
            {
                logger.LogWarning("Embedding failed for chunk {Idx} of document {DocId}: {Err}",
                    chunkIndex, request.DocumentId, embedResult.Error.Message);
                continue; // Skip failed chunks — partial ingestion is better than zero.
            }

            var tokenCount = EstimateTokenCount(chunkText);
            var aiChunk = AiChunk.Create(
                documentId: request.DocumentId,
                organizationId: request.OrganizationId,
                chunkIndex: chunkIndex,
                text: chunkText,
                tokenCount: tokenCount,
                pageNumber: null, // OCR text doesn't carry page breaks in the current pipeline.
                embeddingProvider: provider,
                embeddingModel: model);

            db.AiChunks.Add(aiChunk);
            await db.SaveChangesAsync(cancellationToken); // Save chunk to get its Id.

            var embedding = AiEmbedding.Create(aiChunk.Id, request.OrganizationId, embedResult.Value);
            db.AiEmbeddings.Add(embedding);
            await db.SaveChangesAsync(cancellationToken);

            chunkIndex++;
        }

        logger.LogInformation(
            "RAG ingestion complete for document {DocumentId}: {Count} chunks ingested.",
            request.DocumentId, chunkIndex);

        return Result.Success();
    }

    private static int EstimateTokenCount(string text)
        => (int)Math.Ceiling(text.Split([' ', '\t', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries).Length * 1.3);
}
