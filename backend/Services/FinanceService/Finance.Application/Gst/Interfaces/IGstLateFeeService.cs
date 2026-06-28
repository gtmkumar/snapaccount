using SnapAccount.Shared.Domain;

namespace GstService.Application.Interfaces;

/// <summary>
/// Result of a late-fee + interest calculation for a filed GST return.
/// </summary>
/// <param name="LateFeeAmount">Total late fee in INR (per-day * days late, capped by statutory max).</param>
/// <param name="InterestAmount">Interest in INR on net tax payable (Section 50, 18% p.a. simple interest).</param>
/// <param name="DaysLate">Number of calendar days past the filing deadline.</param>
/// <param name="PerDayRate">The per-day late-fee rate that was applied (INR).</param>
/// <param name="InterestRatePct">The annual interest rate that was applied (%).</param>
public record GstLateFeeResult(
    decimal LateFeeAmount,
    decimal InterestAmount,
    int DaysLate,
    decimal PerDayRate,
    decimal InterestRatePct);

/// <summary>
/// Calculates GST late-fee and interest amounts for a filed return.
/// DG-GST-04: penalty amounts are config-driven (gst.gst_late_fee_rate / gst.gst_interest_rate tables).
/// Rates must never be hardcoded — they change with government notifications.
/// </summary>
public interface IGstLateFeeService
{
    /// <summary>
    /// Calculates the late fee and Section-50 interest for a GST return filed after its deadline.
    /// </summary>
    /// <param name="returnType">GST return type (e.g. 'GSTR-3B', 'GSTR-1').</param>
    /// <param name="isNilReturn">True when all amounts on the return are zero (nil return).</param>
    /// <param name="filingDeadline">Statutory filing deadline.</param>
    /// <param name="filedAt">Actual filing timestamp (UTC).</param>
    /// <param name="netTaxPayable">Net tax payable on the return — used for interest computation.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>
    /// A <see cref="GstLateFeeResult"/> with zero amounts when filed on time,
    /// or <see cref="Result.Failure"/> when the applicable rate is missing from configuration.
    /// </returns>
    Task<Result<GstLateFeeResult>> CalculateAsync(
        string returnType,
        bool isNilReturn,
        DateOnly filingDeadline,
        DateTime filedAt,
        decimal netTaxPayable,
        CancellationToken ct = default);
}
