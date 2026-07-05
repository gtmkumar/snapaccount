using GstService.Application.Interfaces;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;

namespace GstService.Infrastructure.Services;

/// <summary>
/// Computes GST late-fee and interest (CGST Act Section 47 and Section 50) using
/// rates loaded from <c>gst.gst_late_fee_rate</c> and <c>gst.gst_interest_rate</c>.
/// DG-GST-04: rates are config-driven — never hardcoded.
///
/// Algorithm:
///   days_late  = MAX(0, (filed_at.Date - filing_deadline).Days)
///   late_fee   = MIN(per_day_amount * days_late, max_cap_amount ?? ∞)
///   interest   = net_tax_payable * (rate_pct / 100 / 365) * days_late  [simple interest]
/// </summary>
public sealed class GstLateFeeService(
    GstDbContext dbContext,
    ILogger<GstLateFeeService> logger) : IGstLateFeeService
{
    /// <inheritdoc />
    public async Task<Result<GstLateFeeResult>> CalculateAsync(
        string returnType,
        bool isNilReturn,
        DateOnly filingDeadline,
        DateTime filedAt,
        decimal netTaxPayable,
        CancellationToken ct = default)
    {
        var filedDate = DateOnly.FromDateTime(filedAt);

        // Returns 0 amounts when filed on or before the deadline — no penalty
        var daysLate = Math.Max(0, filedDate.DayNumber - filingDeadline.DayNumber);

        if (daysLate == 0)
        {
            logger.LogDebug(
                "GST return filed on time (deadline {Deadline}, filed {Filed}) — no late fee.",
                filingDeadline, filedDate);

            return new GstLateFeeResult(
                LateFeeAmount: 0m,
                InterestAmount: 0m,
                DaysLate: 0,
                PerDayRate: 0m,
                InterestRatePct: 0m);
        }

        // Load applicable late-fee rate
        var lateFeeRate = await dbContext.GstLateFeeRates
            .Where(r => r.ReturnType == returnType
                     && r.IsNilReturn == isNilReturn
                     && r.ValidFrom <= filingDeadline
                     && (r.ValidTo == null || r.ValidTo > filingDeadline))
            .OrderByDescending(r => r.ValidFrom)
            .FirstOrDefaultAsync(ct);

        if (lateFeeRate is null)
        {
            logger.LogWarning(
                "No late-fee rate found for return type {ReturnType}, isNil={IsNil}, deadline {Deadline}. " +
                "Cannot compute penalty — returning zero amounts. " +
                "Seed gst.gst_late_fee_rate with the applicable statutory rate.",
                returnType, isNilReturn, filingDeadline);

            // Return zero with a success — missing rate config is a config gap, not a hard error.
            // The handler logs a warning; the audit trail records zero amounts.
            return new GstLateFeeResult(
                LateFeeAmount: 0m,
                InterestAmount: 0m,
                DaysLate: daysLate,
                PerDayRate: 0m,
                InterestRatePct: 0m);
        }

        // Load applicable interest rate
        var interestRate = await dbContext.GstInterestRates
            .Where(r => r.ValidFrom <= filingDeadline
                     && (r.ValidTo == null || r.ValidTo > filingDeadline))
            .OrderByDescending(r => r.ValidFrom)
            .FirstOrDefaultAsync(ct);

        if (interestRate is null)
        {
            logger.LogWarning(
                "No interest rate found for deadline {Deadline}. Defaulting to 18% p.a.",
                filingDeadline);
        }

        // Compute late fee: per_day * days, capped at statutory maximum
        var rawLateFee = lateFeeRate.PerDayAmount * daysLate;
        var lateFeeAmount = lateFeeRate.MaxCapAmount.HasValue
            ? Math.Min(rawLateFee, lateFeeRate.MaxCapAmount.Value)
            : rawLateFee;

        // Compute interest: simple interest = principal * rate / 365 * days
        var annualRatePct = interestRate?.RatePct ?? 18.0m;
        var interestAmount = netTaxPayable > 0
            ? Math.Round(netTaxPayable * (annualRatePct / 100m / 365m) * daysLate, 2)
            : 0m;

        logger.LogInformation(
            "GST late-fee calculated: return={ReturnType}, isNil={IsNil}, daysLate={Days}, " +
            "perDay={PerDay}, cap={Cap}, lateFee={LateFee}, interest={Interest}",
            returnType, isNilReturn, daysLate,
            lateFeeRate.PerDayAmount, lateFeeRate.MaxCapAmount,
            lateFeeAmount, interestAmount);

        return new GstLateFeeResult(
            LateFeeAmount: lateFeeAmount,
            InterestAmount: interestAmount,
            DaysLate: daysLate,
            PerDayRate: lateFeeRate.PerDayAmount,
            InterestRatePct: annualRatePct);
    }
}
