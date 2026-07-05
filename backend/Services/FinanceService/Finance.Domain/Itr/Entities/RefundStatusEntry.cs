using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Tracks refund status polling for a filing.
/// Updated by the recurring <c>itr_refund_polling</c> job via Pub/Sub.
/// </summary>
public class RefundStatusEntry : BaseAuditableEntity
{
    /// <summary>Filing this refund status belongs to.</summary>
    public Guid FilingId { get; private set; }

    /// <summary>Assessee.</summary>
    public Guid AssesseeId { get; private set; }

    /// <summary>
    /// Refund status from IT dept:
    /// PENDING | PROCESSING | ISSUED | FAILED | NOT_APPLICABLE.
    /// </summary>
    public string RefundStatus { get; private set; } = "PENDING";

    /// <summary>Refund amount (INR). Null until issued.</summary>
    public decimal? RefundAmount { get; private set; }

    /// <summary>Date when refund was issued.</summary>
    public DateOnly? RefundDate { get; private set; }

    /// <summary>Bank account used for refund.</summary>
    public string? BankAccount { get; private set; }

    /// <summary>NSDL/IT dept transaction reference.</summary>
    public string? TransactionReference { get; private set; }

    /// <summary>Raw status message from IT portal.</summary>
    public string? StatusMessage { get; private set; }

    /// <summary>Last polled at timestamp.</summary>
    public DateTime LastPolledAt { get; private set; }

    private RefundStatusEntry() { }

    /// <summary>Creates a new refund status entry.</summary>
    public static RefundStatusEntry Create(Guid filingId, Guid assesseeId)
        => new() { FilingId = filingId, AssesseeId = assesseeId, LastPolledAt = DateTime.UtcNow };

    /// <summary>Updates the refund status from a polling result.</summary>
    public void UpdateStatus(
        string status,
        decimal? amount = null,
        DateOnly? refundDate = null,
        string? transactionRef = null,
        string? statusMessage = null,
        string? bankAccount = null)
    {
        RefundStatus = status;
        RefundAmount = amount;
        RefundDate = refundDate;
        TransactionReference = transactionRef;
        StatusMessage = statusMessage;
        BankAccount = bankAccount;
        LastPolledAt = DateTime.UtcNow;
    }
}
