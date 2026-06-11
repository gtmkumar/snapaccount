using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// MCA Companies (Accounts) Rules statutory edit log entry.
/// Maps to <c>accounting.edit_log</c> (migration 071).
/// APPEND-ONLY — no soft-delete, no updates. Retention: minimum 8 years.
/// Rows are written by DB-level AFTER triggers; the application reads this table
/// for auditor export but never inserts directly.
/// </summary>
public class EditLog : BaseEntity
{
    /// <summary>Organisation this change belongs to (FK by value to auth.organization).</summary>
    public Guid? OrgId { get; private set; }

    /// <summary>
    /// Discriminator for the changed table:
    /// journal_entry | journal_entry_line | ledger_entry | account | ledger.
    /// </summary>
    public string EntityType { get; private set; } = string.Empty;

    /// <summary>Primary key of the changed row.</summary>
    public Guid EntityId { get; private set; }

    /// <summary>Operation: INSERT | UPDATE | DELETE.</summary>
    public string Operation { get; private set; } = string.Empty;

    /// <summary>User who made the change (from <c>app.current_user_id</c> GUC). Null when unset.</summary>
    public Guid? ChangedBy { get; private set; }

    /// <summary>Timestamp of the change (clock_timestamp() inside the trigger).</summary>
    public DateTime ChangedAt { get; private set; }

    /// <summary>Row state before the change (null on INSERT).</summary>
    public string? BeforeState { get; private set; }

    /// <summary>Row state after the change (null on DELETE).</summary>
    public string? AfterState { get; private set; }

    /// <summary>Optional narration supplied by the application via <c>app.change_reason</c> GUC.</summary>
    public string? ChangeReason { get; private set; }

    /// <summary>Trace / correlation request ID from <c>app.request_id</c> GUC.</summary>
    public string? RequestId { get; private set; }

    /// <summary>Correlation ID from <c>app.correlation_id</c> GUC.</summary>
    public string? CorrelationId { get; private set; }

    /// <summary>Financial year string e.g. '2026-27' (best-effort, from the row data).</summary>
    public string? FyYear { get; private set; }

    /// <summary>Statutory minimum KEEP-until date (changed_at + 8 years).</summary>
    public DateOnly? RetentionUntil { get; private set; }

    /// <summary>
    /// Row creation timestamp (mirrors <c>changed_at</c> per MCA audit-column convention).
    /// Set by the database default (<c>NOW()</c>).
    /// </summary>
    public DateTime CreatedAt { get; private set; }

    // EF Core private ctor
    private EditLog() { }
}
