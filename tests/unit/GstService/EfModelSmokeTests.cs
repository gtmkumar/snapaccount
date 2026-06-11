using FluentAssertions;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GstService.Tests;

/// <summary>
/// EF model smoke tests for GstService — validates that the EF Core model can generate
/// SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (the class of bugs fixed in WEB-01..WEB-02).
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class GstEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static GstDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<GstDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new GstDbContext(options);
    }

    [Fact]
    public async Task GstReturns_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstReturns.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_return must be correct");
    }

    [Fact]
    public async Task GstNotices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstNotices.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.notices must be correct (WEB-01 fix)");
    }

    [Fact]
    public async Task ItcMismatches_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ItcMismatches.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.itc_mismatch must be correct (WEB-02 fix)");
    }

    [Fact]
    public async Task GstRefunds_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstRefunds.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_refund must be correct");
    }

    [Fact]
    public async Task GstAnnualReturns_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstAnnualReturns.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_annual_return must be correct");
    }

    [Fact]
    public async Task LutFilings_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LutFilings.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.lut_filing must be correct");
    }

    [Fact]
    public async Task ItcRecords_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ItcRecords.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.itc_record must be correct");
    }
}
