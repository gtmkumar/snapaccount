using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace AiService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>ai</c> schema.
/// Exposes <see cref="AiChunks"/>, <see cref="AiEmbeddings"/>, and <see cref="AiInteractions"/>
/// for the RAG pipeline and AI interaction audit log.
/// </summary>
public class AiServiceDbContext(DbContextOptions<AiServiceDbContext> options)
    : BaseDbContext(options), IAiServiceDbContext
{
    /// <summary>Text chunks produced by the RAG ingestion worker.</summary>
    public DbSet<AiChunk> AiChunks => Set<AiChunk>();

    /// <summary>Vector embeddings (768-dim float array) for each chunk, scoped by org.</summary>
    public DbSet<AiEmbedding> AiEmbeddings => Set<AiEmbedding>();

    /// <summary>Append-only audit log of every AI interaction.</summary>
    public DbSet<AiInteraction> AiInteractions => Set<AiInteraction>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("ai");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AiServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
