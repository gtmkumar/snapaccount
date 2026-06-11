using AiService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests;

/// <summary>
/// EF model smoke tests for AiService — validates that the EF Core model can generate
/// SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// Migration 075 created ai.chunks, ai.embeddings, and ai.interactions.
///
/// TWO test patterns are used here — both are required:
///
/// 1. Projection (Select + ToListAsync): validates column-name mapping for every explicitly
///    selected property. Catches missing/misspelled column names.
///
/// 2. Full-entity materialization (FirstOrDefaultAsync / ToListAsync without Select):
///    EF Core materialises ALL mapped columns — including BaseAuditableEntity.CreatedBy and
///    UpdatedBy. This is the ONLY pattern that surfaces a GuidStringConverter↔TEXT mismatch
///    (the root cause of the W5-IMS-02 class of bugs). A projection that omits CreatedBy/
///    UpdatedBy will pass even when those columns are mis-typed.
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class AiEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static AiServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AiServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new AiServiceDbContext(options);
    }

    // ── ai.chunks ────────────────────────────────────────────────────────────

    /// <summary>
    /// Verifies ai.chunks table mapping — full projection materialises every column
    /// so any EF↔DB name mismatch surfaces as a PostgreSQL column-not-found exception.
    /// </summary>
    [Fact]
    public async Task AiChunks_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AiChunks
            .Select(c => new
            {
                c.Id,
                c.DocumentId,
                c.OrganizationId,
                c.ChunkIndex,
                c.Text,
                c.TokenCount,
                c.PageNumber,
                c.EmbeddingProvider,
                c.EmbeddingModel,
                c.CreatedAt,
                c.UpdatedAt,
                c.DeletedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for ai.chunks must be correct (migration 075)");
    }

    // ── ai.embeddings ────────────────────────────────────────────────────────

    /// <summary>
    /// Verifies ai.embeddings table mapping — the float_vector column is stored as
    /// float4[] (P7a design — pgvector migration is a P7b concern).
    /// </summary>
    [Fact]
    public async Task AiEmbeddings_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AiEmbeddings
            .Select(e => new
            {
                e.Id,
                e.ChunkId,
                e.OrganizationId,
                e.Vector   // mapped to float_vector (float4[]) column
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for ai.embeddings must be correct (float_vector as float4[], migration 075)");
    }

    // ── ai.interactions ──────────────────────────────────────────────────────

    /// <summary>
    /// Verifies ai.interactions table mapping — append-only audit log; no soft-delete filter.
    /// Includes is_reservation column added in migration 077 (RV-03 SEC-AI-02).
    /// </summary>
    [Fact]
    public async Task AiInteractions_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AiInteractions
            .Select(i => new
            {
                i.Id,
                i.OrganizationId,
                i.UserId,
                i.FeatureCode,
                i.Provider,
                i.Model,
                i.InputTokens,
                i.OutputTokens,
                i.LatencyMs,
                i.BudgetExceeded,
                i.IsReservation, // RV-03 (SEC-AI-02): reservation pattern column (migration 077)
                i.CreatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for ai.interactions must be correct (append-only audit log, migrations 075+077)");
    }

    // ── Full-entity materialisation tests (W5-IMS-02 class guard) ────────────
    //
    // These tests call FirstOrDefaultAsync() without a projection so EF Core emits
    // SELECT * and materialises every mapped column — including CreatedBy/UpdatedBy.
    // The projection-based tests above do NOT include those columns and therefore
    // cannot catch a GuidStringConverter↔TEXT type mismatch. This is the exact class
    // of bug fixed in W5-IMS-02 (GstService) and mirrored here for AiService.

    /// <summary>
    /// Full-entity materialisation for ai.chunks.
    /// Verifies that EF Core can read ALL columns — particularly created_by / updated_by
    /// which are TEXT in migration 075 (not uuid). Catches GuidStringConverter↔TEXT mismatch.
    /// </summary>
    [Fact]
    public async Task AiChunks_FullMaterialisation_WithoutError()
    {
        using var db = CreateDbContext();
        // IgnoreQueryFilters so the query runs even if the table is empty (no deleted_at filter).
        var act = async () => await db.AiChunks
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "Full-entity materialisation of ai.chunks must succeed — created_by/updated_by are TEXT (migration 075), not uuid");
    }

    /// <summary>
    /// Full-entity materialisation for ai.interactions.
    /// Verifies that EF Core can read ALL columns — particularly created_by / updated_by
    /// which are TEXT in migration 075 (not uuid). Catches GuidStringConverter↔TEXT mismatch.
    /// </summary>
    [Fact]
    public async Task AiInteractions_FullMaterialisation_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AiInteractions
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "Full-entity materialisation of ai.interactions must succeed — created_by/updated_by are TEXT (migration 075), not uuid");
    }

    /// <summary>
    /// Full-entity materialisation for ai.embeddings.
    /// AiEmbedding is a BaseEntity (no created_by/updated_by) but we include a materialisation
    /// test to ensure the float_vector (float4[]) column mapping is correct end-to-end.
    /// </summary>
    [Fact]
    public async Task AiEmbeddings_FullMaterialisation_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AiEmbeddings
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "Full-entity materialisation of ai.embeddings must succeed — float_vector column is float4[] (migration 075)");
    }
}
