using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using AiService.Infrastructure.Persistence.Configurations;
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
        // W5-IMS-02 mirror fix: base.OnModelCreating MUST run BEFORE
        // ApplyConfigurationsFromAssembly. BaseDbContext.OnModelCreating applies the global
        // GuidStringConverter to CreatedBy/UpdatedBy on every BaseAuditableEntity. When the
        // base call runs AFTER, it overwrites any per-entity HasConversion<string>() overrides
        // set by AiChunkConfiguration and AiInteractionConfiguration, causing Npgsql to bind
        // a uuid-typed parameter against the TEXT columns in migration 075 and throw
        // InvalidCastException on full-entity materialisation (FirstOrDefaultAsync / ToListAsync
        // with no projection). Running base first means per-entity configs win the last-write.
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(AiServiceDbContext).Assembly,
            type => type.Namespace == typeof(AiChunkConfiguration).Namespace);
    }
}
