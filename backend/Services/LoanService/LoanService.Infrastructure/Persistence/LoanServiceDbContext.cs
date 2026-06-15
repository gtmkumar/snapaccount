using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;
using System.Text.Json;

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

    /// <summary>GAP-110: Fraud check decision log (migration 082). Append-only.</summary>
    public DbSet<FraudCheck> FraudChecks => Set<FraudCheck>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("loan");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(LoanServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);

        // SWEEP-FIX: loan.consents has NO deleted_at column (immutable 7-year retention table,
        // protected by DB trigger trg_consents_no_delete). Remove the global soft-delete filter
        // that BaseDbContext.OnModelCreating applies to all BaseAuditableEntity subtypes AFTER
        // ApplyConfigurationsFromAssembly runs (base overwrites the HasQueryFilter(c => true) set
        // in ConsentConfiguration). HasQueryFilter(null) removes the filter entirely.
        // DDL HANDOFF: db-engineer should NOT add deleted_at to loan.consents per RBI retention rules.
        modelBuilder.Entity<Consent>().HasQueryFilter(null!);
    }
}
