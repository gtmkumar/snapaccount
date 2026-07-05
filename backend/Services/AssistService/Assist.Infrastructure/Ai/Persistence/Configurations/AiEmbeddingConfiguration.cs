using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pgvector.EntityFrameworkCore;

namespace AiService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="AiEmbedding"/> — maps to <c>ai.embeddings</c>.
///
/// DG-CHAT-01 (P7b, migration 098): The <c>embedding</c> column is a <c>vector(768)</c>
/// pgvector column mapped via <c>Pgvector.EntityFrameworkCore</c>.  HNSW index with
/// <c>vector_cosine_ops</c> enables cosine top-k ANN retrieval in
/// <see cref="AiService.Application.Chat.Queries.AiChat.AiChatQueryHandler"/>.
///
/// The P7a <c>float_vector FLOAT4[]</c> column is retained in the DB schema per the additive
/// migration rule but is no longer read or written by this application code.
/// </summary>
public sealed class AiEmbeddingConfiguration : IEntityTypeConfiguration<AiEmbedding>
{
    public void Configure(EntityTypeBuilder<AiEmbedding> builder)
    {
        builder.ToTable("embeddings", "ai");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.ChunkId).HasColumnName("chunk_id").IsRequired();
        builder.Property(e => e.OrganizationId).HasColumnName("organization_id").IsRequired();

        // DG-CHAT-01: Map the new pgvector(768) column added in migration 098.
        // float_vector (P7a) is still present in the DB but is NOT mapped here —
        // EF ignores unmapped columns, so no migration action is needed.
        builder.Property(e => e.Embedding)
            .HasColumnName("embedding")
            .HasColumnType("vector(768)")
            .IsRequired();

        // Existing org + chunk indexes (from migration 075).
        builder.HasIndex(e => e.OrganizationId).HasDatabaseName("ix_ai_embeddings_org_id");
        builder.HasIndex(e => e.ChunkId).HasDatabaseName("ix_ai_embeddings_chunk_id");

        // HNSW cosine-distance index — created by migration 098; declared here so
        // EF scaffold / migration diff knows about it.
        builder.HasIndex(e => e.Embedding)
            .HasMethod("hnsw")
            .HasOperators("vector_cosine_ops")
            .HasStorageParameter("m", 16)
            .HasStorageParameter("ef_construction", 64)
            .HasDatabaseName("ix_ai_embeddings_hnsw");
    }
}
