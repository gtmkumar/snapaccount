using LoanService.Application.Services;
using Microsoft.Extensions.Configuration;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// GAP-110: Configuration-driven fraud check thresholds.
/// All values are read from IConfiguration so risk teams can tune via GCP Secret Manager
/// without a code deploy. Values are never hardcoded.
/// </summary>
public sealed class LoanFraudCheckConfig(IConfiguration configuration) : IFraudCheckConfig
{
    /// <inheritdoc />
    public int VelocityPanFlagThreshold
        => configuration.GetValue<int?>("FraudCheck:VelocityPanFlagThreshold") ?? 3;

    /// <inheritdoc />
    public int VelocityPanFailThreshold
        => configuration.GetValue<int?>("FraudCheck:VelocityPanFailThreshold") ?? 5;

    /// <inheritdoc />
    public int VelocityPhoneFlagThreshold
        => configuration.GetValue<int?>("FraudCheck:VelocityPhoneFlagThreshold") ?? 3;

    /// <inheritdoc />
    public int VelocityPhoneFailThreshold
        => configuration.GetValue<int?>("FraudCheck:VelocityPhoneFailThreshold") ?? 5;

    /// <inheritdoc />
    public int VelocityWindowDays
        => configuration.GetValue<int?>("FraudCheck:VelocityWindowDays") ?? 30;

    /// <inheritdoc />
    public int DuplicatePanOrgThreshold
        => configuration.GetValue<int?>("FraudCheck:DuplicatePanOrgThreshold") ?? 2;

    /// <inheritdoc />
    public int DuplicatePhoneOrgThreshold
        => configuration.GetValue<int?>("FraudCheck:DuplicatePhoneOrgThreshold") ?? 2;

    /// <inheritdoc />
    public double PennyDropMinSimilarity
        => configuration.GetValue<double?>("FraudCheck:PennyDropMinSimilarity") ?? 0.80;

    /// <inheritdoc />
    public bool SuppressFlagInPackage
        => configuration.GetValue<bool?>("FraudCheck:SuppressFlagInPackage") ?? false;
}
