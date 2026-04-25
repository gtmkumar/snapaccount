using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the accounting schema database context.
/// Query handlers depend on this interface for direct LINQ projection (Jason Taylor pattern).
/// Write-side command handlers use the repository interfaces for aggregate lifecycle management.
/// </summary>
public interface IAccountingDbContext
{
    /// <summary>Chart of accounts in <c>accounting.accounts</c>.</summary>
    DbSet<Account> Accounts { get; }

    /// <summary>Journal entries in <c>accounting.journal_entries</c>.</summary>
    DbSet<JournalEntry> JournalEntries { get; }

    /// <summary>Journal entry lines (debit/credit) in <c>accounting.journal_entry_lines</c>.</summary>
    DbSet<JournalEntryLine> JournalEntryLines { get; }

    /// <summary>Internal audit records.</summary>
    DbSet<InternalAudit> InternalAudits { get; }

    /// <summary>Internal audit findings.</summary>
    DbSet<InternalAuditFinding> InternalAuditFindings { get; }

    // Phase 6A additions

    /// <summary>Double-entry ledger entries in <c>accounting.ledger_entries</c>.</summary>
    DbSet<LedgerEntry> LedgerEntries { get; }

    /// <summary>Per-org chart of accounts materialised from COA templates.</summary>
    DbSet<ChartOfAccount> ChartOfAccounts { get; }

    /// <summary>Journal batches grouping balanced ledger entries.</summary>
    DbSet<JournalBatch> JournalBatches { get; }

    /// <summary>
    /// Fiscal year close records — maps to existing <c>accounting.financial_year_close</c>
    /// table (migration 003). P6-HANDOFF-01.
    /// </summary>
    DbSet<FiscalYearClose> FiscalYearCloses { get; }

    /// <summary>Persists changes to the accounting schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
