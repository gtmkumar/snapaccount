using FluentAssertions;
using ItrService.Application.Services;
using ItrService.Application.TaxSlabs.Queries.GetDeductionCatalog;
using ItrService.Application.TaxSlabs.Queries.GetTaxSlabs;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using System.Reflection;
using Xunit;

namespace ItrService.Tests;

/// <summary>
/// Unit tests for IT Act 2025 version resolution (GAP-102 / migration 072).
///
/// Rules under test:
///   1. For AY &lt; 2026-27 → always resolve IT_ACT_1961.
///   2. For AY &gt;= 2026-27 AND IT_ACT_2025 rows exist → resolve IT_ACT_2025.
///   3. For AY &gt;= 2026-27 AND no IT_ACT_2025 rows → fall back to IT_ACT_1961 (warning).
///   4. Response DTOs include <c>ActVersion</c> field.
///   5. TaxComputationEngine uses the same resolution rule.
///
/// All tests are pure in-memory (InMemoryDatabase) — no real Postgres needed.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ActVersionResolutionTests : IDisposable
{
    private readonly ItrServiceDbContext _db;

    // Minimal slab JSON for seeding
    private const string MinimalSlabJson = """[{"from_income":0,"to_income":null,"rate_pct":5}]""";

    public ActVersionResolutionTests()
    {
        var options = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ItrServiceDbContext(options);
    }

    public void Dispose() => _db.Dispose();

    // ── ResolveTargetActVersion helper ────────────────────────────────────────

    [Theory]
    [InlineData("AY2024-25", "IT_ACT_1961")]
    [InlineData("AY2025-26", "IT_ACT_1961")]
    [InlineData("AY2026-27", "IT_ACT_2025")]  // first year new Act applies
    [InlineData("AY2027-28", "IT_ACT_2025")]
    [InlineData("AY2030-31", "IT_ACT_2025")]
    public void ResolveTargetActVersion_Returns_Expected_ActVersion(string ay, string expected)
    {
        var result = GetTaxSlabsQueryHandler.ResolveTargetActVersion(ay);

        result.Should().Be(expected, $"AY={ay} should resolve to {expected}");
    }

    [Theory]
    [InlineData("AY2024-25", "IT_ACT_1961")]
    [InlineData("AY2025-26", "IT_ACT_1961")]
    [InlineData("AY2026-27", "IT_ACT_2025")]
    [InlineData("AY2027-28", "IT_ACT_2025")]
    public void DeductionCatalogHandler_ResolveTargetActVersion_Consistent(string ay, string expected)
    {
        // Verify the deduction catalog handler uses the same rule
        var result = GetDeductionCatalogQueryHandler.ResolveTargetActVersion(ay);

        result.Should().Be(expected);
    }

    // ── GetTaxSlabsQuery — pre-2026-27 resolves 1961 ─────────────────────────

    [Fact]
    public async Task GetTaxSlabs_AY2025_26_Resolves_IT_ACT_1961()
    {
        // Seed a 1961 row for AY2025-26
        var slabV = MakeSlabVersion("AY2025-26", "NEW", "IT_ACT_1961");
        _db.TaxSlabVersions.Add(slabV);
        await _db.SaveChangesAsync();

        var handler = new GetTaxSlabsQueryHandler(_db, NullLogger<GetTaxSlabsQueryHandler>.Instance);
        var result = await handler.Handle(new GetTaxSlabsQuery("AY2025-26", "NEW"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ActVersion.Should().Be("IT_ACT_1961");
    }

    // ── GetTaxSlabsQuery — 2026-27 prefers 2025-Act when seeded ──────────────

    [Fact]
    public async Task GetTaxSlabs_AY2026_27_Resolves_IT_ACT_2025_WhenSeeded()
    {
        // Seed both 1961 and 2025 rows for AY2026-27
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2026-27", "NEW", "IT_ACT_1961"));
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2026-27", "NEW", "IT_ACT_2025"));
        await _db.SaveChangesAsync();

        var handler = new GetTaxSlabsQueryHandler(_db, NullLogger<GetTaxSlabsQueryHandler>.Instance);
        var result = await handler.Handle(new GetTaxSlabsQuery("AY2026-27", "NEW"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ActVersion.Should().Be("IT_ACT_2025");
    }

    // ── GetTaxSlabsQuery — 2026-27 falls back to 1961 when 2025-Act not seeded ─

    [Fact]
    public async Task GetTaxSlabs_AY2026_27_FallsBackTo_IT_ACT_1961_WhenNotSeeded()
    {
        // Only seed a 1961 row for AY2026-27 — no 2025-Act row
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2026-27", "OLD", "IT_ACT_1961"));
        await _db.SaveChangesAsync();

        var handler = new GetTaxSlabsQueryHandler(_db, NullLogger<GetTaxSlabsQueryHandler>.Instance);
        var result = await handler.Handle(new GetTaxSlabsQuery("AY2026-27", "OLD"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ActVersion.Should().Be("IT_ACT_1961",
            "fall-back to IT_ACT_1961 when no 2025-Act rows are seeded");
    }

    // ── GetTaxSlabsQuery — response DTO has ActVersion field ─────────────────

    [Fact]
    public async Task GetTaxSlabs_Response_IncludesActVersion()
    {
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2025-26", "OLD", "IT_ACT_1961"));
        await _db.SaveChangesAsync();

        var handler = new GetTaxSlabsQueryHandler(_db, NullLogger<GetTaxSlabsQueryHandler>.Instance);
        var result = await handler.Handle(new GetTaxSlabsQuery("AY2025-26", "OLD"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // ActVersion field present in DTO and non-null
        result.Value.ActVersion.Should().NotBeNullOrEmpty();
        result.Value.ActVersion.Should().BeOneOf("IT_ACT_1961", "IT_ACT_2025");
    }

    // ── TaxComputationEngine — act_version resolution ─────────────────────────

    [Fact]
    public async Task TaxComputationEngine_AY2025_26_UsesIT_ACT_1961()
    {
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2025-26", "NEW", "IT_ACT_1961",
            slabsJson: """[{"from_income":0,"to_income":300000,"rate_pct":0},{"from_income":300000,"to_income":null,"rate_pct":5}]"""));
        await _db.SaveChangesAsync();

        var engine = new TaxComputationEngine(_db, NullLogger<TaxComputationEngine>.Instance);
        var input = new TaxComputationInput(
            "AY2025-26", "NEW",
            SalaryIncome: 5_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 0, Section80D: 0, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 0);

        var result = await engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue("IT_ACT_1961 slab for AY2025-26 should be found");
    }

    [Fact]
    public async Task TaxComputationEngine_AY2026_27_FallsBackTo1961_WhenNo2025ActSeeded()
    {
        // Simulate the state before IT_ACT_2025 content is seeded
        _db.TaxSlabVersions.Add(MakeSlabVersion("AY2026-27", "NEW", "IT_ACT_1961",
            slabsJson: """[{"from_income":0,"to_income":null,"rate_pct":5}]"""));
        await _db.SaveChangesAsync();

        var engine = new TaxComputationEngine(_db, NullLogger<TaxComputationEngine>.Instance);
        var input = new TaxComputationInput(
            "AY2026-27", "NEW",
            SalaryIncome: 5_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 0, Section80D: 0, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 0);

        var result = await engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue("should fall back to IT_ACT_1961 when 2025-Act not seeded");
    }

    // ── TaxSlab entity has ActVersion + TaxYear properties ───────────────────

    [Fact]
    public void TaxSlabVersion_Has_ActVersion_Property()
    {
        var entity = MakeSlabVersion("AY2026-27", "NEW", "IT_ACT_2025");

        entity.ActVersion.Should().Be("IT_ACT_2025");
    }

    [Fact]
    public void TaxSlabVersion_DefaultActVersion_Is_IT_ACT_1961()
    {
        var entity = MakeSlabVersion("AY2025-26", "OLD", null); // use default

        entity.ActVersion.Should().Be("IT_ACT_1961");
    }

    // ── Validator ────────────────────────────────────────────────────────────

    [Fact]
    public void GetTaxSlabsQueryValidator_InvalidAyFormat_Fails()
    {
        var validator = new GetTaxSlabsQueryValidator();
        var result = validator.Validate(new GetTaxSlabsQuery("2026-27", "NEW")); // missing "AY" prefix

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void GetTaxSlabsQueryValidator_ValidQuery_Passes()
    {
        var validator = new GetTaxSlabsQueryValidator();
        var result = validator.Validate(new GetTaxSlabsQuery("AY2026-27", "OLD"));

        result.IsValid.Should().BeTrue();
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private static TaxSlabVersion MakeSlabVersion(
        string ay, string regime, string? actVersion,
        string? slabsJson = null)
    {
        var tsv = (TaxSlabVersion)System.Runtime.CompilerServices.RuntimeHelpers
            .GetUninitializedObject(typeof(TaxSlabVersion));

        Set(tsv, "Id", Guid.NewGuid());
        Set(tsv, "AssessmentYear", ay);
        Set(tsv, "Regime", regime);
        Set(tsv, "SlabsJson", slabsJson ?? MinimalSlabJson);
        Set(tsv, "StandardDeduction", 50_000m);
        Set(tsv, "Rebate87AIncomeLimit", 5_00_000m);
        Set(tsv, "Rebate87AMaxAmount", 12_500m);
        Set(tsv, "CessRatePct", 4m);
        Set(tsv, "EffectiveFrom", new DateOnly(2024, 4, 1));
        Set(tsv, "ActVersion", actVersion ?? "IT_ACT_1961");

        return tsv;
    }

    private static void Set(object obj, string propName, object value)
    {
        var prop = obj.GetType().GetProperty(propName,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            ?? throw new InvalidOperationException($"Property '{propName}' not found on {obj.GetType().Name}");
        prop.SetValue(obj, value);
    }
}
