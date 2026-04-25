namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the ai schema database context.
/// Phase 1: stub — DbSet properties (EmbeddingChunk, AiInteraction, etc.) will be added in Phase 2
/// when the RAG pipeline and Semantic Kernel integration are implemented.
/// </summary>
public interface IAiServiceDbContext
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
