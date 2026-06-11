using FluentAssertions;
using LoanService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LoanService.Tests;

/// <summary>
/// EF model smoke tests for LoanService — validates that the EF Core model can generate
/// SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (BUG: LoanProducts had no config → table not found).
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class LoanEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static LoanServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<LoanServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new LoanServiceDbContext(options);
    }

    [Fact]
    public async Task LoanApplications_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LoanApplications.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.applications must be correct");
    }

    [Fact]
    public async Task LoanProducts_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LoanProducts.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.loan_products must be correct (BUG-FIX: was missing config)");
    }

    [Fact]
    public async Task PartnerBanks_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.PartnerBanks.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.partner_banks must be correct");
    }

    [Fact]
    public async Task Consents_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Consents.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.consents must be correct");
    }

    [Fact]
    public async Task LoanPdfPackages_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LoanPdfPackages.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.pdf_packages must be correct");
    }

    [Fact]
    public async Task ApplicationStatusLogs_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ApplicationStatusLogs.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.application_status_log must be correct");
    }

    [Fact]
    public async Task WebhookIdempotencyKeys_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.WebhookIdempotencyKeys.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.webhook_idempotency_keys must be correct");
    }

    [Fact]
    public async Task ConsentCatalog_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ConsentCatalog.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.consent_catalog must be correct");
    }

    [Fact]
    public async Task KeyFactsStatements_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.KeyFactsStatements.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for loan.key_facts_statement must be correct");
    }
}
