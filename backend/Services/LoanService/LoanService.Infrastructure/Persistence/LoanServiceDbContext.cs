using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace LoanService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for LoanService. Schema isolated to 'loan.*'.
/// P6-HANDOFF-25: wired to NEW canonical plural tables (loan.applications, loan.partner_banks, etc.)
/// </summary>
public class LoanServiceDbContext(DbContextOptions<LoanServiceDbContext> options)
    : BaseDbContext(options), ILoanServiceDbContext
{
    /// <inheritdoc />
    public DbSet<LoanApplication> LoanApplications => Set<LoanApplication>();

    /// <inheritdoc />
    public DbSet<LoanProduct> LoanProducts => Set<LoanProduct>();

    /// <inheritdoc />
    public DbSet<Consent> Consents => Set<Consent>();

    /// <inheritdoc />
    public DbSet<PartnerBank> PartnerBanks => Set<PartnerBank>();

    /// <inheritdoc />
    public DbSet<ApplicationDocument> ApplicationDocuments => Set<ApplicationDocument>();

    /// <inheritdoc />
    public DbSet<ApplicationStatusLog> ApplicationStatusLogs => Set<ApplicationStatusLog>();

    /// <inheritdoc />
    public DbSet<LoanPdfPackage> LoanPdfPackages => Set<LoanPdfPackage>();

    /// <inheritdoc />
    public DbSet<WebhookIdempotencyKey> WebhookIdempotencyKeys => Set<WebhookIdempotencyKey>();

    /// <inheritdoc />
    public DbSet<ConsentCatalogEntry> ConsentCatalog => Set<ConsentCatalogEntry>();

    /// <inheritdoc />
    public DbSet<KeyFactsStatement> KeyFactsStatements => Set<KeyFactsStatement>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("loan");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(LoanServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
