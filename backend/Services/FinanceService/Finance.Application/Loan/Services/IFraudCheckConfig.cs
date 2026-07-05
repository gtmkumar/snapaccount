namespace LoanService.Application.Services;

/// <summary>
/// GAP-110: Configuration-driven thresholds for fraud velocity rules.
/// All values are driven by configuration (IConfiguration / GCP Secret Manager) —
/// never hardcoded as constants — so risk teams can tune without a code deploy.
/// </summary>
public interface IFraudCheckConfig
{
    /// <summary>
    /// Maximum number of applications from the same PAN across ALL orgs in the rolling window
    /// before the check returns <c>Flag</c>.
    /// Default: 3.
    /// </summary>
    int VelocityPanFlagThreshold { get; }

    /// <summary>
    /// Maximum number before escalating to <c>Fail</c> (hard block).
    /// Default: 5.
    /// </summary>
    int VelocityPanFailThreshold { get; }

    /// <summary>
    /// Maximum number of applications from the same phone number across ALL orgs in the window
    /// before returning <c>Flag</c>.
    /// Default: 3.
    /// </summary>
    int VelocityPhoneFlagThreshold { get; }

    /// <summary>Maximum before escalating to <c>Fail</c>. Default: 5.</summary>
    int VelocityPhoneFailThreshold { get; }

    /// <summary>Rolling window for velocity rules in days. Default: 30.</summary>
    int VelocityWindowDays { get; }

    /// <summary>
    /// Minimum number of OTHER orgs in which the same PAN has an application before flagging.
    /// Default: 2.
    /// </summary>
    int DuplicatePanOrgThreshold { get; }

    /// <summary>
    /// Minimum number of OTHER orgs in which the same phone appears before flagging.
    /// Default: 2.
    /// </summary>
    int DuplicatePhoneOrgThreshold { get; }

    /// <summary>Penny-drop similarity score below which names are considered non-matching [0.0, 1.0]. Default: 0.80.</summary>
    double PennyDropMinSimilarity { get; }

    /// <summary>
    /// When true, FLAG verdicts are included as a review note but do NOT add a fraud summary flag
    /// to the bank package. Default: false (flags ARE included in the package summary).
    /// </summary>
    bool SuppressFlagInPackage { get; }

    /// <summary>
    /// GAP-110 gate: when true, a loan application can only be submitted after the fraud
    /// pre-check has actually been run (≥1 <c>loan.fraud_checks</c> row exists). Soft-launch
    /// flag mirroring <c>DeviceApproval:Enforce</c> / <c>DeviceIntegrity:Enforce</c>: ops flip
    /// it on once mobile/admin clients call the fraud-check endpoint before submit.
    /// Independent of this flag, a latest-verdict <c>Fail</c> on any check ALWAYS blocks
    /// submission (defence in depth). Default: false.
    /// </summary>
    bool EnforceOnSubmit { get; }
}
