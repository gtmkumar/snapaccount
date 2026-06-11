using SnapAccount.Shared.Domain;

namespace AiService.Domain.Entities;

/// <summary>
/// Represents a text chunk extracted from a document for RAG ingestion.
/// One document produces N chunks (512-token target, 64-token overlap).
/// The <see cref="ChunkIndex"/> is zero-based position within the document.
/// </summary>
public sealed class AiChunk : BaseAuditableEntity
{
    /// <summary>Source document identifier (from DocumentService).</summary>
    public Guid DocumentId { get; private set; }

    /// <summary>Organisation that owns the document — used for org-scoped retrieval.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>Zero-based chunk index within the document.</summary>
    public int ChunkIndex { get; private set; }

    /// <summary>The actual text content of this chunk.</summary>
    public string Text { get; private set; } = string.Empty;

    /// <summary>
    /// Token count estimate at ingestion time (approximation based on whitespace split).
    /// Stored for observability; not used at query time.
    /// </summary>
    public int TokenCount { get; private set; }

    /// <summary>
    /// Page number within the source document, if known (1-based). Null when the source
    /// does not expose page breaks (e.g. plain-text OCR without page markers).
    /// </summary>
    public int? PageNumber { get; private set; }

    /// <summary>Provider used to embed this chunk (e.g. "vertex", "mock").</summary>
    public string EmbeddingProvider { get; private set; } = string.Empty;

    /// <summary>Model used to embed this chunk (e.g. "text-embedding-005").</summary>
    public string EmbeddingModel { get; private set; } = string.Empty;

    /// <summary>Navigation to the embedding produced for this chunk (lazy-loaded by EF Core).</summary>
    public AiEmbedding? Embedding { get; private set; }

    // EF Core constructor
    private AiChunk() { }

    /// <summary>Creates a new chunk ready for embedding.</summary>
    public static AiChunk Create(
        Guid documentId,
        Guid organizationId,
        int chunkIndex,
        string text,
        int tokenCount,
        int? pageNumber,
        string embeddingProvider,
        string embeddingModel)
    {
        return new AiChunk
        {
            Id = Guid.NewGuid(),
            DocumentId = documentId,
            OrganizationId = organizationId,
            ChunkIndex = chunkIndex,
            Text = text,
            TokenCount = tokenCount,
            PageNumber = pageNumber,
            EmbeddingProvider = embeddingProvider,
            EmbeddingModel = embeddingModel,
        };
    }
}
