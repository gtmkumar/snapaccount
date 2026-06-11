using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="AiEmbedding"/> — maps to <c>ai.embeddings</c>.
///
/// The <c>vector</c> column type (pgvector) is NOT mapped via EF Core conventions here —
/// it requires the <c>Pgvector.EntityFrameworkCore</c> NuGet extension, which is a P7b concern.
/// For P7a the vector is stored as a raw float[] JSON column (<c>float_vector</c>).
/// The DDL handoff section provides the real <c>vector(768)</c> DDL with HNSW index.
/// Production migration will replace this float[] column with the pgvector column.
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

        // P7a: stored as float[] JSON until Pgvector.EntityFrameworkCore is wired in P7b.
        // Production DDL will use vector(768) + HNSW index (see DDL handoff in task report).
        builder.Property(e => e.Vector)
            .HasColumnName("float_vector")
            .HasColumnType("float4[]")
            .IsRequired();

        builder.HasIndex(e => e.OrganizationId).HasDatabaseName("ix_ai_embeddings_org_id");
        builder.HasIndex(e => e.ChunkId).HasDatabaseName("ix_ai_embeddings_chunk_id");
    }
}
