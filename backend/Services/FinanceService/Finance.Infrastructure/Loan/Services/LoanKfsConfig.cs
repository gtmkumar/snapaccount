using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Reads KFS configuration from <c>appsettings.json</c> / environment variables.
/// Config keys: <c>Loan:ProcessingFeeRate</c>, <c>Loan:GrievanceOfficerContact</c>,
/// <c>Loan:CoolingOffDays</c>.
/// </summary>
public sealed class LoanKfsConfig(IConfiguration configuration) : ILoanKfsConfig
{
    public decimal ProcessingFeeRate =>
        configuration.GetValue<decimal>("Loan:ProcessingFeeRate", 0.02m);

    public string GrievanceOfficerContact =>
        configuration.GetValue<string>("Loan:GrievanceOfficerContact")
        ?? "Grievance Officer | grievance@snapaccount.in | +91-1800-XXX-XXXX";

    public int CoolingOffDays =>
        configuration.GetValue<int>("Loan:CoolingOffDays", 3);
}
