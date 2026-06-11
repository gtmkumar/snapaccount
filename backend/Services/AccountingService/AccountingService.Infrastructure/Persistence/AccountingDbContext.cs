using AccountingService.Application.Common.Interfaces;
using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace AccountingService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>accounting</c> schema.
/// Implements <see cref="IAccountingDbContext"/> for query-handler direct projection.
/// Audit stamping and domain event dispatch are handled by registered
/// <c>ISaveChangesInterceptor</c> instances.
/// Phase 6A: added LedgerEntry, ChartOfAccount, JournalBatch, FiscalYearClose DbSets.
/// Phase 7 / GAP-100: added EditLog DbSet (read-only; written by DB triggers).
/// </summary>
public class AccountingDbContext(DbContextOptions<AccountingDbContext> options)
    : BaseDbContext(options), IAccountingDbContext
{
    // Pre-existing
    /// <inheritdoc />
    public DbSet<Account> Accounts => Set<Account>();

    /// <inheritdoc />
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();

    /// <inheritdoc />
    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();

    /// <inheritdoc />
    public DbSet<InternalAudit> InternalAudits => Set<InternalAudit>();

    /// <inheritdoc />
    public DbSet<InternalAuditFinding> InternalAuditFindings => Set<InternalAuditFinding>();

    // Phase 6A additions
    /// <inheritdoc />
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();

    /// <inheritdoc />
    public DbSet<ChartOfAccount> ChartOfAccounts => Set<ChartOfAccount>();

    /// <inheritdoc />
    public DbSet<JournalBatch> JournalBatches => Set<JournalBatch>();

    /// <inheritdoc />
    public DbSet<FiscalYearClose> FiscalYearCloses => Set<FiscalYearClose>();

    /// <summary>
    /// MCA statutory edit log (migration 071). Read-only from the application perspective;
    /// rows are written exclusively by DB-level AFTER triggers.
    /// </summary>
    public DbSet<EditLog> EditLogs => Set<EditLog>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("accounting");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AccountingDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
