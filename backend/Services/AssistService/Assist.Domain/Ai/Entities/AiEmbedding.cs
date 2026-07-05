using Pgvector;
using SnapAccount.Shared.Domain;

namespace AiService.Domain.Entities;

/// <summary>
/// Stores the vector embedding for an <see cref="AiChunk"/>.
/// The <see cref="Embedding"/> property is a <c>vector(768)</c> pgvector column mapped via
/// <c>Pgvector.EntityFrameworkCore</c>. A HNSW cosine-distance index enables efficient top-k
/// ANN retrieval.
///
/// DG-CHAT-01: Upgraded from P7a float4[] to P7b vector(768) + HNSW (migration 098).
///
/// RLS policy: users may only retrieve embeddings whose <see cref="OrganizationId"/>
/// matches their own organisation (enforced at DB level via app.current_user_id GUC).
/// </summary>
public sealed class AiEmbedding : BaseEntity
{
    /// <summary>Foreign key to <see cref="AiChunk"/>.</summary>
    public Guid ChunkId { get; private set; }

    /// <summary>De-normalised for RLS scoping — avoids a JOIN on every retrieval query.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// 768-dimensional pgvector embedding produced by the embedding model
    /// (Vertex AI text-embedding-005 in production, mock zeros in local/CI).
    /// Mapped to <c>vector(768)</c> in PostgreSQL via <c>Pgvector.EntityFrameworkCore</c>.
    ///
    /// DG-CHAT-01 (P7b): This replaces the P7a <c>float_vector FLOAT4[]</c> column.
    /// The EF configuration maps this to the <c>embedding</c> column in ai.embeddings
    /// with the HNSW cosine-distance index (<c>ix_ai_embeddings_hnsw</c>).
    /// </summary>
    public Vector Embedding { get; private set; } = new Vector(new float[768]);

    /// <summary>Navigation back to the chunk.</summary>
    public AiChunk? Chunk { get; private set; }

    // EF Core constructor
    private AiEmbedding() { }

    /// <summary>Creates an embedding record for the given chunk.</summary>
    public static AiEmbedding Create(Guid chunkId, Guid organizationId, float[] vector)
        => new()
        {
            Id = Guid.NewGuid(),
            ChunkId = chunkId,
            OrganizationId = organizationId,
            Embedding = new Vector(vector),
        };
}
