using SnapAccount.Shared.Domain;

namespace AiService.Domain.Entities;

/// <summary>
/// Stores the vector embedding for an <see cref="AiChunk"/>.
/// The <see cref="Vector"/> column is a <c>vector(768)</c> (pgvector) column — stored as a
/// <c>float[]</c> on the .NET side and mapped to the pgvector type via Npgsql.
/// A HNSW index on this column enables efficient cosine-distance top-k retrieval.
///
/// RLS policy: users may only retrieve embeddings whose <see cref="OrganizationId"/>
/// matches their own organisation (enforced at DB level — see DDL handoff).
/// </summary>
public sealed class AiEmbedding : BaseEntity
{
    /// <summary>Foreign key to <see cref="AiChunk"/>.</summary>
    public Guid ChunkId { get; private set; }

    /// <summary>De-normalised for RLS scoping — avoids a JOIN on every retrieval query.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// 768-dimensional float vector produced by the embedding model
    /// (Vertex AI text-embedding-005 in production, mock zeros in local/CI).
    /// Mapped to <c>vector(768)</c> in PostgreSQL via the pgvector extension.
    /// </summary>
    public float[] Vector { get; private set; } = [];

    /// <summary>Navigation back to the chunk.</summary>
    public AiChunk? Chunk { get; private set; }

    // EF Core constructor
    private AiEmbedding() { }

    /// <summary>Creates an embedding record for the given chunk.</summary>
    public static AiEmbedding Create(Guid chunkId, Guid organizationId, float[] vector)
    {
        return new AiEmbedding
        {
            Id = Guid.NewGuid(),
            ChunkId = chunkId,
            OrganizationId = organizationId,
            Vector = vector,
        };
    }
}
