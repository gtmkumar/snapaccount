using FluentAssertions;
using ItrService.Application.Services;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using System.Reflection;

namespace ItrService.Tests;

/// <summary>
/// Golden-file unit tests for <see cref="TaxComputationEngine"/>.
/// Covers AY2025-26 OLD regime, AY2025-26 NEW regime,
/// AY2026-27 OLD regime, AY2026-27 NEW regime.
/// Phase 6D — P6-HANDOFF-18: computation pinning audit invariant verified.
/// Uses EF Core InMemory database with seeded TaxSlabVersions.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TaxComputationGoldenFileTests : IDisposable
{
    private readonly ItrServiceDbContext _db;
    private readonly TaxComputationEngine _engine;

    // AY2025-26 OLD regime slabs:
    // 0–2.5L: 0%, 2.5L–5L: 5%, 5L–10L: 20%, 10L+: 30%
    private const string OldSlabs2526 = """[{"from_income":0,"to_income":250000,"rate_pct":0},{"from_income":250000,"to_income":500000,"rate_pct":5},{"from_income":500000,"to_income":1000000,"rate_pct":20},{"from_income":1000000,"to_income":null,"rate_pct":30}]""";

    // AY2025-26 NEW regime slabs (Budget 2024-25):
    // 0–3L: 0%, 3L–7L: 5%, 7L–10L: 10%, 10L–12L: 15%, 12L–15L: 20%, 15L+: 30%
    private const string NewSlabs2526 = """[{"from_income":0,"to_income":300000,"rate_pct":0},{"from_income":300000,"to_income":700000,"rate_pct":5},{"from_income":700000,"to_income":1000000,"rate_pct":10},{"from_income":1000000,"to_income":1200000,"rate_pct":15},{"from_income":1200000,"to_income":1500000,"rate_pct":20},{"from_income":1500000,"to_income":null,"rate_pct":30}]""";

    public TaxComputationGoldenFileTests()
    {
        var options = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new ItrServiceDbContext(options);

        // Seed tax slab versions — EF Core InMemory can set private props via factory
        _db.TaxSlabVersions.AddRange(
            MakeSlabVersion("AY2025-26", "OLD", OldSlabs2526, 50_000m, 5_00_000m, 12_500m, 4m),
            MakeSlabVersion("AY2025-26", "NEW", NewSlabs2526, 75_000m, 7_00_000m, 25_000m, 4m),
            MakeSlabVersion("AY2026-27", "OLD", OldSlabs2526, 50_000m, 5_00_000m, 12_500m, 4m),
            MakeSlabVersion("AY2026-27", "NEW", NewSlabs2526, 75_000m, 7_00_000m, 25_000m, 4m)
        );
        _db.SaveChanges();

        _engine = new TaxComputationEngine(_db, NullLogger<TaxComputationEngine>.Instance);
    }

    public void Dispose() => _db.Dispose();

    /// <summary>Creates a TaxSlabVersion using reflection to set private properties (test-only helper).</summary>
    private static TaxSlabVersion MakeSlabVersion(
        string ay, string regime, string slabsJson,
        decimal stdDeduction, decimal rebate87ALimit, decimal rebate87AMax, decimal cessRatePct,
        string actVersion = "IT_ACT_1961")
    {
        // EF Core requires a parameterless private ctor + property setters.
        // Use reflection to set private backing values for this seed-only helper.
        var tsv = (TaxSlabVersion)System.Runtime.CompilerServices.RuntimeHelpers
            .GetUninitializedObject(typeof(TaxSlabVersion));

        Set(tsv, "Id", Guid.NewGuid());
        Set(tsv, "AssessmentYear", ay);
        Set(tsv, "Regime", regime);
        Set(tsv, "SlabsJson", slabsJson);
        Set(tsv, "StandardDeduction", stdDeduction);
        Set(tsv, "Rebate87AIncomeLimit", rebate87ALimit);
        Set(tsv, "Rebate87AMaxAmount", rebate87AMax);
        Set(tsv, "CessRatePct", cessRatePct);
        Set(tsv, "EffectiveFrom", new DateOnly(2024, 4, 1));
        // GAP-102: act_version is required (migration 072). Default IT_ACT_1961 for existing tests.
        Set(tsv, "ActVersion", actVersion);

        return tsv;
    }

    private static void Set(object obj, string propName, object value)
    {
        var prop = obj.GetType().GetProperty(propName,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            ?? throw new InvalidOperationException($"Property '{propName}' not found on {obj.GetType().Name}");
        prop.SetValue(obj, value);
    }

    // ── AY2025-26 OLD Regime ─────────────────────────────────────────────────

    [Fact]
    public async Task GoldenFile_AY2025_26_OldRegime_SalaryAndDeductions_ComputesCorrectly()
    {
        // GTI = 12,00,000 salary
        // Standard deduction (OLD) = 50,000 → 11,50,000
        // 80C = 1,50,000; 80D = 25,000; 80E = 10,000 → total deductions = 1,85,000
        // Taxable = 11,50,000 - 1,85,000 = 9,65,000
        // Tax: 0-2.5L=0; 2.5L-5L=12,500; 5L-9.65L=93,000 → gross = 1,05,500
        // Rebate 87A: taxable > 5L → no rebate
        // Cess 4% = 4,220 → total = 1,09,720
        // TDS = 90,000 → payable = 19,720
        var input = new TaxComputationInput(
            "AY2025-26", "OLD",
            SalaryIncome: 12_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 1_50_000m, Section80D: 25_000m, Section80E: 10_000m, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 90_000m);

        var result = await _engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue();
        var r = result.Value;
        r.AssessmentYear.Should().Be("AY2025-26");
        r.Regime.Should().Be("OLD");
        r.GrossTotalIncome.Should().Be(12_00_000m);
        r.StandardDeduction.Should().Be(50_000m);
        // TotalDeductions includes standard deduction + chapter VI-A deductions
        r.TotalDeductions.Should().Be(2_35_000m); // 50K std + 1.5L 80C + 25K 80D + 10K 80E
        r.TaxableIncome.Should().Be(9_65_000m);
        r.GrossTax.Should().Be(1_05_500m);
        r.TotalTaxPayable.Should().Be(1_09_720m);
        r.PayableOrRefund.Should().Be(19_720m); // payable
        r.ComputationHash.Should().NotBeNullOrEmpty();
        r.ComputationJsonb.Should().NotBeNullOrEmpty();
    }

    // ── AY2025-26 NEW Regime ─────────────────────────────────────────────────

    [Fact]
    public async Task GoldenFile_AY2025_26_NewRegime_SalaryNoDeductions_ComputesCorrectly()
    {
        // GTI = 12,00,000; new regime standard deduction = 75,000
        // Taxable = 11,25,000 (new regime ignores 80C/80D)
        // No 87A (taxable > 7L)
        // Tax: 0-3L=0; 3L-7L=20,000; 7L-10L=30,000; 10L-11.25L=18,750 → gross = 68,750
        // Cess 4% = 2,750 → total = 71,500
        var input = new TaxComputationInput(
            "AY2025-26", "NEW",
            SalaryIncome: 12_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 1_50_000m, // should be ignored in NEW regime
            Section80D: 25_000m,
            Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 60_000m);

        var result = await _engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue();
        var r = result.Value;
        r.Regime.Should().Be("NEW");
        r.GrossTotalIncome.Should().Be(12_00_000m);
        r.StandardDeduction.Should().Be(75_000m);
        r.TaxableIncome.Should().Be(11_25_000m);
        r.GrossTax.Should().Be(68_750m);
        r.TotalTaxPayable.Should().Be(71_500m);
        r.PayableOrRefund.Should().Be(11_500m); // 71,500 - 60,000 = 11,500 payable
        r.ComputationHash.Should().NotBeNullOrEmpty();
    }

    // ── AY2026-27 OLD Regime ─────────────────────────────────────────────────

    [Fact]
    public async Task GoldenFile_AY2026_27_OldRegime_SalaryAndHPLoss_ComputesCorrectly()
    {
        // 15L salary - 2L HP loss = 13L GTI
        // Std deduction = 50K → 12.5L after std
        // 80C=1.5L, 80D=50K → total deductions = 2L
        // Taxable = 12.5L - 2L = 10.5L
        // Tax: 0-2.5L=0; 2.5L-5L=12,500; 5L-10L=1,00,000; 10L-10.5L=15,000 → gross=1,27,500
        // Cess 4% = 5,100 → total = 1,32,600
        var input = new TaxComputationInput(
            "AY2026-27", "OLD",
            SalaryIncome: 15_00_000m,
            HousePropertyIncome: -2_00_000m,
            BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 1_50_000m, Section80D: 50_000m, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 1_50_000m);

        var result = await _engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue();
        var r = result.Value;
        r.AssessmentYear.Should().Be("AY2026-27");
        r.Regime.Should().Be("OLD");
        r.GrossTotalIncome.Should().Be(13_00_000m);
        r.TaxableIncome.Should().Be(10_50_000m);
        r.GrossTax.Should().Be(1_27_500m);
        r.TotalTaxPayable.Should().Be(1_32_600m);
        r.PayableOrRefund.Should().Be(-17_400m); // refund
        r.ComputationHash.Should().NotBeNullOrEmpty();
    }

    // ── AY2026-27 NEW Regime ─────────────────────────────────────────────────

    [Fact]
    public async Task GoldenFile_AY2026_27_NewRegime_HighIncome_ComputesCorrectly()
    {
        // 20L income, new regime, no deductions except std
        // Taxable = 20L - 75K = 19.25L
        // Tax: 0-3L=0; 3L-7L=20K; 7L-10L=30K; 10L-12L=30K; 12L-15L=60K; 15L-19.25L=1,27,500 → gross=2,67,500
        // Cess 4% = 10,700 → total = 2,78,200
        var input = new TaxComputationInput(
            "AY2026-27", "NEW",
            SalaryIncome: 20_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 0, Section80D: 0, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 1_00_000m, TdsPaid: 1_00_000m);

        var result = await _engine.ComputeAsync(input);

        result.IsSuccess.Should().BeTrue();
        var r = result.Value;
        r.AssessmentYear.Should().Be("AY2026-27");
        r.Regime.Should().Be("NEW");
        r.GrossTotalIncome.Should().Be(20_00_000m);
        r.TaxableIncome.Should().Be(19_25_000m);
        r.GrossTax.Should().Be(2_67_500m);
        r.TotalTaxPayable.Should().Be(2_78_200m);
        r.ComputationHash.Should().NotBeNullOrEmpty();
    }

    // ── Determinism ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GoldenFile_ComputationHash_IsDeterministicAcrossMultipleCalls()
    {
        var input = new TaxComputationInput(
            "AY2025-26", "NEW",
            SalaryIncome: 8_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 0, Section80D: 0, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 0);

        var r1 = await _engine.ComputeAsync(input);
        var r2 = await _engine.ComputeAsync(input);

        r1.IsSuccess.Should().BeTrue();
        r2.IsSuccess.Should().BeTrue();
        r1.Value.ComputationHash.Should().Be(r2.Value.ComputationHash);
    }

    [Fact]
    public async Task GoldenFile_UnknownAssessmentYear_ReturnsNotFoundError()
    {
        var input = new TaxComputationInput(
            "AY2099-00", "NEW",
            SalaryIncome: 10_00_000m,
            HousePropertyIncome: 0, BusinessIncome: 0, CapitalGains: 0, OtherIncome: 0,
            Section80C: 0, Section80D: 0, Section80E: 0, OtherDeductions: 0,
            AdvanceTaxPaid: 0, TdsPaid: 0);

        var result = await _engine.ComputeAsync(input);
        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Contain("TaxSlab");
    }
}
