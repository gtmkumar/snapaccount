using FluentAssertions;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ItrService.Tests;

/// <summary>
/// EF model smoke tests for ItrService — validates that the EF Core model can generate
/// SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (sweep-fix: multiple configurations mapped non-existent columns).
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class ItrEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static ItrServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new ItrServiceDbContext(options);
    }

    [Fact]
    public async Task Assessees_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Assessees.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.assessee_profiles must be correct");
    }

    [Fact]
    public async Task Filings_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Filings.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.filings must be correct");
    }

    [Fact]
    public async Task TaxSlabVersions_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Use FirstOrDefaultAsync (not AnyAsync) to force EF to project ALL mapped columns.
        // AnyAsync only emits SELECT 1 / EXISTS and misses wrong column names on non-PK properties.
        // This test caught: cess_pct (live) mapped as cess_rate_pct (convention); rebate_under_87a
        // (live) mapped as rebate87_a_income_limit; effective_to (live) mapped as effective_until.
        var act = async () => await db.TaxSlabVersions
            .Select(t => new
            {
                t.Id,
                t.AssessmentYear,
                t.Regime,
                t.SlabsJson,
                t.StandardDeduction,
                t.Rebate87AIncomeLimit,
                t.Rebate87AMaxAmount,
                t.SurchargeJson,
                t.CessRatePct,
                t.EffectiveFrom,
                t.EffectiveUntil,
                t.ActVersion,
                t.TaxYear
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for itr.tax_slab_versions must project all columns without error. " +
            "Check HasColumnName for: ay, slabs_jsonb, rebate_under_87a, rebate_under_87a_amount, " +
            "cess_pct, effective_to, act_version, tax_year.");
    }

    [Fact]
    public async Task DeductionSections_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Full-projection query to catch column name mismatches.
        // Live columns: section (NOT section_code), ay, regime, description,
        //   max_amount (NOT max_limit), is_available (NOT is_active), act_version, tax_year.
        var act = async () => await db.DeductionSections
            .Select(d => new
            {
                d.Id,
                d.SectionCode,   // column: section
                d.Regime,        // column: regime
                d.Description,   // column: description
                d.MaxLimit,      // column: max_amount
                d.AssessmentYear,// column: ay
                d.IsAvailable,   // column: is_available
                d.ActVersion,    // column: act_version
                d.TaxYear        // column: tax_year
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for itr.deduction_sections must project all live columns without error. " +
            "Key renames: SectionCode→section, MaxLimit→max_amount, IsAvailable→is_available.");
    }

    [Fact]
    public async Task Form16Extracts_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Form16Extracts.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.form_16_extracts must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task ItrNotices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ItrNotices.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.notices must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task RefundStatusEntries_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.RefundStatusEntries.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.refund_status_log must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task Grievances_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Grievances.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.grievances must be correct");
    }

    [Fact]
    public async Task TaxComputations_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.TaxComputations.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.tax_computation must be correct (SWEEP-FIX: no config existed)");
    }

    [Fact]
    public async Task AdvanceTaxes_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AdvanceTaxes.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.advance_tax must be correct (SWEEP-FIX: quarter/installment column rename)");
    }

    [Fact]
    public async Task LowerTdsCertificates_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LowerTdsCertificates.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.lower_tds_certificate must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task SpecifiedPersonChecks_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.SpecifiedPersonChecks.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.specified_person_check must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task TransferPricingReports_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.TransferPricingReports.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.transfer_pricing_report must be correct (SWEEP-FIX: column name alignment)");
    }

    [Fact]
    public async Task EqualisationLevies_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.EqualisationLevies.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for itr.equalisation_levy must be correct (SWEEP-FIX: column name alignment)");
    }
}
