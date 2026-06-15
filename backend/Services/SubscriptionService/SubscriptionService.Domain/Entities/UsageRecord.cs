using SnapAccount.Shared.Domain;

namespace SubscriptionService.Domain.Entities;

/// <summary>
/// Metered usage record for feature consumption tracking.
///
/// Append-only ledger row — one record per metered event (document upload, AI call, etc.)
/// per organisation per billing period.  Aggregated to produce monthly usage reports
/// and to enforce plan-level feature quotas.
/// </summary>
public class UsageRecord : BaseAuditableEntity
{
    /// <summary>Organisation that incurred this usage.</summary>
    public Guid OrgId { get; private set; }

    /// <summary>
    /// Feature category code.
    /// Values: "document.upload", "ai.call", "chat.session", "gst.filing", "itr.filing", "loan.application".
    /// </summary>
    public string FeatureCode { get; private set; } = string.Empty;

    /// <summary>Number of units consumed (e.g. 1 per upload, 1 per AI call).</summary>
    public int Units { get; private set; } = 1;

    /// <summary>Billing period start (first day of the month, UTC midnight).</summary>
    public DateTime PeriodStart { get; private set; }

    /// <summary>Billing period end (last day of the month, UTC end of day).</summary>
    public DateTime PeriodEnd { get; private set; }

    /// <summary>Optional correlation ID for traceability (e.g. document_id, chat_session_id).</summary>
    public string? CorrelationId { get; private set; }

    private UsageRecord() { }

    /// <summary>Creates a metered usage record for the current billing period.</summary>
    public static UsageRecord Record(
        Guid orgId,
        string featureCode,
        int units = 1,
        string? correlationId = null)
    {
        var now = DateTime.UtcNow;
        return new UsageRecord
        {
            OrgId = orgId,
            FeatureCode = featureCode,
            Units = units,
            PeriodStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc),
            PeriodEnd = new DateTime(now.Year, now.Month,
                DateTime.DaysInMonth(now.Year, now.Month), 23, 59, 59, DateTimeKind.Utc),
            CorrelationId = correlationId,
        };
    }
}
