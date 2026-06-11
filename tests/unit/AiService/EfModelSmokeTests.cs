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
/// House rule: use full SELECT projections (ToListAsync / Select(...)) rather than
/// AnyAsync() — AnyAsync() emits "SELECT 1 FROM table LIMIT 1" which does NOT
/// materialise column names and therefore cannot surface EF↔DB column mapping errors.
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
}
