using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Append-only audit log for every action taken on an <see cref="ImsInvoice"/>.
/// Records who changed what status and when, including bulk operations and
/// deemed-acceptance sweep events.
///
/// This log is immutable — rows are never updated or deleted.
/// Soft-delete on the parent ImsInvoice does NOT cascade here (7-year retention).
/// </summary>
public sealed class ImsActionLog : BaseEntity
{
    /// <summary>Invoice this log entry belongs to.</summary>
    public Guid ImsInvoiceId { get; private set; }

    /// <summary>Organisation (for RLS scoping).</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// Action taken.
    /// Values: ACCEPTED | REJECTED | PENDING_KEPT | DEEMED_ACCEPTED
    /// </summary>
    public string Action { get; private set; } = string.Empty;

    /// <summary>Status before the action.</summary>
    public string PreviousStatus { get; private set; } = string.Empty;

    /// <summary>Status after the action.</summary>
    public string NewStatus { get; private set; } = string.Empty;

    /// <summary>UTC timestamp of the action.</summary>
    public DateTime ActedAt { get; private set; }

    /// <summary>
    /// User who took the action. Null for system-generated events
    /// (deemed-acceptance sweep).
    /// </summary>
    public Guid? ActedBy { get; private set; }

    /// <summary>Optional free-text reason (used for REJECTED action).</summary>
    public string? Reason { get; private set; }

    /// <summary>
    /// True if this entry was generated as part of a bulk action request.
    /// </summary>
    public bool IsBulk { get; private set; }

    private ImsActionLog() { } // EF Core

    /// <summary>Creates a new immutable log entry.</summary>
    public static ImsActionLog Create(
        Guid imsInvoiceId,
        Guid organizationId,
        string action,
        string previousStatus,
        string newStatus,
        Guid? actedBy,
        string? reason = null,
        bool isBulk = false)
    {
        return new ImsActionLog
        {
            ImsInvoiceId = imsInvoiceId,
            OrganizationId = organizationId,
            Action = action,
            PreviousStatus = previousStatus,
            NewStatus = newStatus,
            ActedAt = DateTime.UtcNow,
            ActedBy = actedBy,
            Reason = reason,
            IsBulk = isBulk
        };
    }
}
