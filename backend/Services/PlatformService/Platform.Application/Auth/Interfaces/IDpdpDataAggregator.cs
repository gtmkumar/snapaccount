namespace AuthService.Application.Interfaces;

/// <summary>
/// DG-SEC-04: Aggregates personal data held by every module (document, gst, loan, itr,
/// accounting, chat, callback) for a DPDP data-portability export bundle.
///
/// The implementation (in Infrastructure) queries each schema directly via the shared
/// PostgreSQL connection — all composites use a single DB, so cross-schema reads are
/// legal at the infrastructure layer without requiring cross-project references to other
/// module DbContext types.
///
/// The returned <see cref="DpdpCrossSchemaBundle"/> is serialised into the final JSON
/// bundle by <see cref="DataExportJob"/> alongside the auth-schema data.
/// </summary>
public interface IDpdpDataAggregator
{
    /// <summary>
    /// Fetches all PII-bearing rows held by the non-auth modules for <paramref name="userId"/>.
    /// </summary>
    Task<DpdpCrossSchemaBundle> AggregateAsync(Guid userId, CancellationToken ct = default);
}

// ─── Value objects returned by the aggregator ──────────────────────────────

/// <summary>Top-level container for cross-schema personal data.</summary>
public sealed record DpdpCrossSchemaBundle(
    IReadOnlyList<DpdpDocumentRow>     Documents,
    IReadOnlyList<DpdpGstReturnRow>    GstReturns,
    IReadOnlyList<DpdpLoanRow>         LoanApplications,
    IReadOnlyList<DpdpItrFilingRow>    ItrFilings,
    IReadOnlyList<DpdpJournalEntryRow> JournalEntries,
    IReadOnlyList<DpdpChatThreadRow>   ChatThreads,
    IReadOnlyList<DpdpCallbackRow>     Callbacks
);

/// <summary>Document metadata (document.documents) — no storage path PII, filename only.</summary>
public sealed record DpdpDocumentRow(
    Guid    Id,
    string? OriginalFileName,
    string? Status,
    string? MimeType,
    DateTime UploadedAt
);

/// <summary>GST return header (gst.gst_returns).</summary>
public sealed record DpdpGstReturnRow(
    Guid    Id,
    string  ReturnType,
    string  TaxPeriod,
    string  Status,
    decimal TotalTaxableValue,
    decimal NetTaxPayable,
    DateTime CreatedAt
);

/// <summary>Loan application header (loan.loan_applications).</summary>
public sealed record DpdpLoanRow(
    Guid    Id,
    string  Status,
    decimal LoanAmount,
    string? Purpose,
    DateTime CreatedAt
);

/// <summary>ITR filing record (itr.filings).</summary>
public sealed record DpdpItrFilingRow(
    Guid    Id,
    string  AssessmentYear,
    string  ItrForm,
    string  Status,
    decimal? TotalIncome,
    DateTime CreatedAt
);

/// <summary>Journal entry summary (accounting.journal_entries) — amount totals only, no ledger lines.</summary>
public sealed record DpdpJournalEntryRow(
    Guid     Id,
    string   EntryType,
    DateTime EntryDate,
    decimal  Amount,
    string?  Narration,
    DateTime CreatedAt
);

/// <summary>Chat thread with participant role (chat.threads + chat.thread_participants).</summary>
public sealed record DpdpChatThreadRow(
    Guid    ThreadId,
    string  Subject,
    string  Status,
    int     MessageCount,
    DateTime CreatedAt
);

/// <summary>Callback request (callback.callbacks).</summary>
public sealed record DpdpCallbackRow(
    Guid    Id,
    string  Category,
    string  Status,
    string? ScheduledSlot,
    DateTime CreatedAt
);
