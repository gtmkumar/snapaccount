using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the <c>ai</c> schema database context.
/// Exposes DbSets for RAG pipeline entities and AI interaction audit logs.
/// </summary>
public interface IAiServiceDbContext
{
    /// <summary>Text chunks produced by the RAG ingestion worker.</summary>
    DbSet<AiChunk> AiChunks { get; }

    /// <summary>Vector embeddings (768-dim, pgvector) for each chunk, scoped by org.</summary>
    DbSet<AiEmbedding> AiEmbeddings { get; }

    /// <summary>Audit log of every AI interaction (extraction + chat).</summary>
    DbSet<AiInteraction> AiInteractions { get; }

    /// <summary>Persists changes to the database.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
