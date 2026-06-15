namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Exposes configurable KFS (Key Facts Statement) parameters to the Application layer
/// without introducing a direct dependency on <c>Microsoft.Extensions.Configuration</c>.
/// Implemented in Infrastructure by reading <c>appsettings.json</c> / env vars.
/// </summary>
public interface ILoanKfsConfig
{
    /// <summary>Processing fee as a fraction of principal (default: 0.02 = 2%).</summary>
    decimal ProcessingFeeRate { get; }

    /// <summary>
    /// Grievance officer contact string displayed in the KFS (RBI mandate).
    /// Format: "Name | email | phone"
    /// </summary>
    string GrievanceOfficerContact { get; }

    /// <summary>Number of calendar days in the cooling-off window after disbursal (default: 3).</summary>
    int CoolingOffDays { get; }
}
