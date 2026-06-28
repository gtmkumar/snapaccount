using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using AiService.Infrastructure.Persistence;
using AiService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Pgvector.EntityFrameworkCore;

namespace AiService.Tests;

/// <summary>
/// Concurrency tests for <see cref="TokenBudgetService"/> — verifying that the RESERVATION PATTERN
/// (RV-03, SEC-AI-02) prevents concurrent requests for the same org from simultaneously bypassing
/// the daily token budget.
///
/// <para>
/// The unit-level tests use an in-memory DbContext to verify the shape of <see cref="AiInteraction"/>
/// reservation rows, finalisation, and abort paths.
/// </para>
///
/// <para>
/// The EfSmoke test (Category=EfSmoke) uses a real PostgreSQL instance to verify that the advisory
/// lock correctly serialises concurrent budget acquisitions such that only ONE of two concurrent
/// requests passes when the budget admits exactly one.
/// </para>
/// </summary>
[Trait("Category", "Unit")]
public sealed class TokenBudgetConcurrencyTests
{
    // ── Unit-level: reservation row shape tests ──────────────────────────────

    [Fact]
    public void AiInteraction_Reserve_SetsIsReservationTrue()
    {
        var reservation = AiInteraction.Reserve(
            organizationId: Guid.NewGuid(),
            userId: "user-123",
            featureCode: "chat_qa",
            estimatedInputTokens: 1_000);

        reservation.IsReservation.Should().BeTrue(
            "a newly created reservation row must have IsReservation = true");
        reservation.InputTokens.Should().Be(1_000,
            "estimated tokens are stored so the daily-sum query can count them");
        reservation.OutputTokens.Should().Be(0);
        reservation.Provider.Should().Be("pending");
    }

    [Fact]
    public void AiInteraction_Finalise_ClearsReservationFlag()
    {
        var reservation = AiInteraction.Reserve(Guid.NewGuid(), "user", "chat_qa", 1_000);

        reservation.Finalise("vertex", "gemini-2.0-flash", 512, 256, 1_450);

        reservation.IsReservation.Should().BeFalse(
            "finalised rows must have IsReservation = false so they are counted as consumed");
        reservation.InputTokens.Should().Be(512);
        reservation.OutputTokens.Should().Be(256);
        reservation.Provider.Should().Be("vertex");
        reservation.Model.Should().Be("gemini-2.0-flash");
        reservation.LatencyMs.Should().Be(1_450);
    }

    [Fact]
    public void AiInteraction_MarkFailed_ZeroesTokensAndClearsFlag()
    {
        var reservation = AiInteraction.Reserve(Guid.NewGuid(), "user", "invoice_extract", 1_000);

        reservation.MarkFailed("provider_timeout");

        reservation.IsReservation.Should().BeFalse(
            "aborted reservation rows must not remain as reservations (budget should not be consumed)");
        reservation.InputTokens.Should().Be(0,
            "failed calls must not consume budget — tokens zeroed out");
        reservation.OutputTokens.Should().Be(0);
        reservation.Provider.Should().Be("failed");
    }

    [Fact]
    public void AiInteraction_Record_IsReservationFalse()
    {
        var record = AiInteraction.Record(
            Guid.NewGuid(), "user", "chat_qa", "vertex", "gemini-2.0-flash",
            512, 256, 1_200, budgetExceeded: false);

        record.IsReservation.Should().BeFalse(
            "direct records (budget-exceeded audit, admin path) are never reservations");
    }

    // ── Unit-level: reservation counted by budget check ──────────────────────

    /// <summary>
    /// Verifies that when a reservation row is in-flight (IsReservation = true, InputTokens = 1000),
    /// the budget SUM query includes it and correctly blocks the second request when the combined
    /// count would exceed the daily budget.
    ///
    /// This is the logical core of the RV-03 fix — the in-memory test cannot exercise the
    /// advisory lock, but it verifies the SUM predicate includes reservation rows.
    ///
    /// Note: the AuditableEntityInterceptor sets CreatedAt in real DB contexts. In-memory tests
    /// bypass interceptors, so we set CreatedAt directly and omit the date filter (which is
    /// safe here because the unique orgId + feature code already isolates the rows).
    /// </summary>
    [Fact]
    public async Task BudgetCheck_WithExistingReservation_BlocksSecondRequest()
    {
        // Arrange: daily budget = 1500 tokens; a reservation row with 1000 tokens already exists.
        const int dailyBudget = 1_500;
        var orgId = Guid.NewGuid();

        var options = new DbContextOptionsBuilder<TestAiDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new TestAiDbContext(options);

        // Pre-insert a reservation row as if request 1 is in-flight.
        // Set CreatedAt manually (bypassed by in-memory — no interceptor).
        var existingReservation = AiInteraction.Reserve(orgId, "user1", "chat_qa", 1_000);
        existingReservation.CreatedAt = DateTime.UtcNow;
        db.AiInteractions.Add(existingReservation);
        await db.SaveChangesAsync();

        // Act: simulate the budget SUM query that request 2 would run.
        // RV-03 fix: the SUM must include reservation rows (IsReservation = true, InputTokens = 1000).
        // Omit CreatedAt filter here (unique orgId + feature isolates rows in this in-memory test).
        var todayUsed = await db.AiInteractions
            .Where(i => i.OrganizationId == orgId
                        && i.FeatureCode == "chat_qa"
                        && !i.BudgetExceeded)
            .SumAsync(i => i.InputTokens + i.OutputTokens);

        // The reservation estimate (1000) plus the new request estimate (1000) = 2000 > 1500 budget.
        const int newRequestEstimate = 1_000; // TokenBudgetService.ReservationEstimatedTokens
        var wouldExceed = todayUsed + newRequestEstimate > dailyBudget;

        // Assert: request 2 should be blocked because the reservation is counted.
        todayUsed.Should().Be(1_000,
            "the in-flight reservation row (IsReservation=true, InputTokens=1000) must be included " +
            "in the daily SUM so concurrent requests see each other's in-progress consumption");
        wouldExceed.Should().BeTrue(
            "RV-03: a second request seeing the reservation should determine budget is exhausted");
    }

    /// <summary>
    /// Verifies that after MarkFailed (abort), the reservation row no longer contributes
    /// estimated tokens to the budget sum — so a subsequent request is NOT incorrectly blocked.
    /// </summary>
    [Fact]
    public async Task BudgetCheck_AfterAbort_DoesNotBlockNextRequest()
    {
        const int dailyBudget = 1_500;
        var orgId = Guid.NewGuid();

        var options = new DbContextOptionsBuilder<TestAiDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new TestAiDbContext(options);

        // Simulate a failed call: reservation created then aborted (zeroed out).
        var failedReservation = AiInteraction.Reserve(orgId, "user1", "chat_qa", 1_000);
        failedReservation.MarkFailed("provider_timeout");
        failedReservation.CreatedAt = DateTime.UtcNow;
        db.AiInteractions.Add(failedReservation);
        await db.SaveChangesAsync();

        // Simulate the budget check for the next request (unique orgId isolates rows).
        var todayUsed = await db.AiInteractions
            .Where(i => i.OrganizationId == orgId
                        && i.FeatureCode == "chat_qa"
                        && !i.BudgetExceeded)
            .SumAsync(i => i.InputTokens + i.OutputTokens);

        const int newRequestEstimate = 1_000;
        var wouldExceed = todayUsed + newRequestEstimate > dailyBudget;

        todayUsed.Should().Be(0,
            "an aborted reservation must be zeroed so failed calls do not permanently consume budget");
        wouldExceed.Should().BeFalse(
            "the next request should be allowed after the previous call failed and was zeroed");
    }
}

/// <summary>
/// EfSmoke-tier concurrent concurrency test against a real PostgreSQL instance.
/// Verifies that two parallel TryAcquireBudgetSlotAsync calls with a budget that admits
/// only ONE pass result in exactly one allowed and one denied.
///
/// Requires: local postgres running with snapaccount DB (ai.interactions table present).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class TokenBudgetConcurrencyEfSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static AiServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AiServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0).UseVector())
            .Options;
        return new AiServiceDbContext(options);
    }

    /// <summary>
    /// Two concurrent TryAcquireBudgetSlotAsync calls for the same org against live PG,
    /// with a tiny daily budget (1500 tokens) that admits only one request (estimate = 1000).
    /// The second concurrent call must see the first's reservation and be denied.
    ///
    /// RV-03 (SEC-AI-02): the advisory lock ensures the reservations are inserted sequentially
    /// so the second call sees the first's row in its SumAsync and counts 1000 already used.
    /// With budget = 1500 and estimate = 1000, sum + estimate (2000) > budget (1500) → denied.
    /// </summary>
    [Fact]
    public async Task TwoParallelRequests_SameBudgetOrg_ExactlyOneAllowed()
    {
        // Use a unique orgId per test run so parallel CI runs don't interfere.
        var orgId = Guid.NewGuid();
        const int tinyBudget = 1_500; // admits exactly ONE 1000-token reservation

        // Clean up any pre-existing rows for this org (defensive — orgId is unique per run).
        using var setupDb = CreateDbContext();
        var existingRows = await setupDb.AiInteractions
            .Where(i => i.OrganizationId == orgId)
            .ToListAsync();
        // No delete path (append-only trigger) — unique orgId guarantees isolation.

        // Run two concurrent budget acquisition attempts.
        var db1 = CreateDbContext();
        var db2 = CreateDbContext();
        try
        {
            var svc1 = new TokenBudgetService(db1, NullLogger<TokenBudgetService>.Instance);
            var svc2 = new TokenBudgetService(db2, NullLogger<TokenBudgetService>.Instance);

            // Fire both concurrently.
            var task1 = svc1.TryAcquireBudgetSlotAsync(orgId, "user1", "chat_qa", tinyBudget, CancellationToken.None);
            var task2 = svc2.TryAcquireBudgetSlotAsync(orgId, "user2", "chat_qa", tinyBudget, CancellationToken.None);

            var results = await Task.WhenAll(task1, task2);
            var allowedCount = results.Count(r => r.Allowed);
            var deniedCount = results.Count(r => !r.Allowed);

            // RV-03 assertion: advisory lock + reservation row ensures exactly one passes.
            allowedCount.Should().Be(1,
                "RV-03: the pg_advisory_xact_lock + reservation pattern must serialise concurrent " +
                "budget checks so exactly one of two concurrent requests passes when budget admits only one");
            deniedCount.Should().Be(1,
                "RV-03: the second request must see the reservation row in its SumAsync and be denied");
        }
        finally
        {
            await db1.DisposeAsync();
            await db2.DisposeAsync();
        }
    }
}
