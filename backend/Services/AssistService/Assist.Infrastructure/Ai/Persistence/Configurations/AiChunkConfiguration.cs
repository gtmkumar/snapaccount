using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="AiChunk"/> — maps to <c>ai.chunks</c>.
/// snake_case column names via <see cref="SnapAccount.Shared.Infrastructure.Persistence.BaseDbContext"/> convention.
/// </summary>
public sealed class AiChunkConfiguration : IEntityTypeConfiguration<AiChunk>
{
    public void Configure(EntityTypeBuilder<AiChunk> builder)
    {
        builder.ToTable("chunks", "ai");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");

        builder.Property(c => c.DocumentId).HasColumnName("document_id").IsRequired();
        builder.Property(c => c.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(c => c.ChunkIndex).HasColumnName("chunk_index").IsRequired();
        builder.Property(c => c.Text).HasColumnName("text").IsRequired();
        builder.Property(c => c.TokenCount).HasColumnName("token_count").IsRequired();
        builder.Property(c => c.PageNumber).HasColumnName("page_number");
        builder.Property(c => c.EmbeddingProvider).HasColumnName("embedding_provider").HasMaxLength(32).IsRequired();
        builder.Property(c => c.EmbeddingModel).HasColumnName("embedding_model").HasMaxLength(64).IsRequired();
        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        // W5-IMS-02 mirror fix: ai.chunks.created_by / updated_by are TEXT columns in
        // migration 075 (not uuid). BaseDbContext applies GuidStringConverter globally to
        // all BaseAuditableEntity.CreatedBy/UpdatedBy properties; that converter tells Npgsql
        // to bind a uuid provider type, causing InvalidCastException when the column is TEXT.
        // Override here with identity HasConversion<string>() so no conversion is applied and
        // Npgsql reads/writes the column as plain text (Firebase UID strings).
        builder.Property(c => c.CreatedBy)
            .HasColumnName("created_by")
            .HasColumnType("text")
            .HasConversion<string>();
        builder.Property(c => c.UpdatedBy)
            .HasColumnName("updated_by")
            .HasColumnType("text")
            .HasConversion<string>();

        builder.HasIndex(c => c.DocumentId).HasDatabaseName("ix_ai_chunks_document_id");
        builder.HasIndex(c => c.OrganizationId).HasDatabaseName("ix_ai_chunks_organization_id");
        builder.HasIndex(c => new { c.DocumentId, c.ChunkIndex })
            .IsUnique()
            .HasDatabaseName("uix_ai_chunks_document_index");

        // Navigation to embedding (one-to-one).
        builder.HasOne(c => c.Embedding)
            .WithOne(e => e.Chunk)
            .HasForeignKey<AiEmbedding>(e => e.ChunkId)
            .OnDelete(DeleteBehavior.Cascade);

        // Soft-delete global filter.
        builder.HasQueryFilter(c => c.DeletedAt == null);
    }
}
