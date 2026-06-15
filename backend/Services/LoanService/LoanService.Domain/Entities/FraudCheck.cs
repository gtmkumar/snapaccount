using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace LoanService.Domain.Entities;

/// <summary>
/// Fraud check result for a single check type on a loan application.
/// Appended to the <c>loan.fraud_checks</c> table; rows are immutable (decision-log style).
/// GAP-110: must be created before an application moves to Submitted/bank-package.
/// </summary>
public class FraudCheck : BaseAuditableEntity
{
    /// <summary>FK → loan.applications.id.</summary>
    public Guid ApplicationId { get; private set; }

    /// <summary>Type of fraud check performed (see <see cref="FraudCheckType"/>).</summary>
    public FraudCheckType CheckType { get; private set; }

    /// <summary>
    /// Verdict of the check.
    /// <list type="bullet">
    ///   <item><see cref="FraudVerdict.Pass"/> — no signal; submission allowed.</item>
    ///   <item><see cref="FraudVerdict.Flag"/> — signal detected; operator review note added; submission NOT blocked.</item>
    ///   <item><see cref="FraudVerdict.Fail"/> — hard signal; submission BLOCKED.</item>
    /// </list>
    /// </summary>
    public FraudVerdict Verdict { get; private set; }

    /// <summary>Structured details serialised to JSONB. Aggregate counts only — never raw PII from other orgs.</summary>
    public JsonDocument? Details { get; private set; }

    /// <summary>Human-readable summary written to the decision log (visible to operator-tier users).</summary>
    public string DecisionNote { get; private set; } = string.Empty;

    /// <summary>UTC timestamp when this check was evaluated.</summary>
    public DateTime CheckedAt { get; private set; }

    private FraudCheck() { }

    /// <summary>Creates a fraud check result record.</summary>
    public static FraudCheck Create(
        Guid applicationId,
        FraudCheckType checkType,
        FraudVerdict verdict,
        string decisionNote,
        JsonDocument? details = null)
        => new()
        {
            ApplicationId = applicationId,
            CheckType = checkType,
            Verdict = verdict,
            DecisionNote = decisionNote,
            Details = details,
            CheckedAt = DateTime.UtcNow
        };
}

/// <summary>Fraud check types performed before submission.</summary>
public enum FraudCheckType
{
    /// <summary>Same PAN appearing across OTHER orgs' loan applications (cross-org, count-only).</summary>
    DuplicatePan,

    /// <summary>Same phone number appearing across OTHER orgs' applications (cross-org, count-only).</summary>
    DuplicatePhone,

    /// <summary>Same device-id appearing across OTHER orgs' applications.</summary>
    DuplicateDevice,

    /// <summary>Velocity rule: ≥N applications per PAN within 30 days.</summary>
    VelocityPan,

    /// <summary>Velocity rule: ≥N applications per phone number within 30 days.</summary>
    VelocityPhone,

    /// <summary>Penny-drop name-match verification against the applicant's declared name.</summary>
    PennyDrop
}

/// <summary>Verdict outcome of a fraud check.</summary>
public enum FraudVerdict
{
    /// <summary>No fraud signal detected; submission is allowed.</summary>
    Pass,

    /// <summary>Soft fraud signal; operator review note added; submission is NOT blocked.</summary>
    Flag,

    /// <summary>Hard fraud signal; submission is BLOCKED with typed Result error.</summary>
    Fail
}
