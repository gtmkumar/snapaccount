using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Queries.GetLateFeePreview;

/// <summary>
/// Previews the late-fee and interest amounts for a GST return if it were filed today.
/// DG-GST-04: used by the admin review page (Screen 64 'Late fees calculated') to
/// surface the penalty before the CA commits to filing.
/// </summary>
[RequiresPermission("gst.returns.read")]
public record GetLateFeePreviewQuery(
    Guid GstReturnId,
    /// <summary>Override 'filed at' date for what-if calculations. Defaults to today (UTC).</summary>
    DateTime? AsOfDateTime = null)
    : IQuery<LateFeePreviewDto>;

/// <summary>Preview of late-fee and interest for a GST return.</summary>
public record LateFeePreviewDto(
    Guid GstReturnId,
    string ReturnType,
    DateOnly? FilingDeadline,
    int DaysLate,
    decimal PerDayRate,
    decimal LateFeeAmount,
    decimal InterestRatePct,
    decimal InterestAmount,
    decimal TotalPenaltyAmount,
    bool IsFiledOnTime,
    /// <summary>
    /// True when no rate was found in config (zero amounts returned as fallback).
    /// Indicates a data-entry gap in gst.gst_late_fee_rate.
    /// </summary>
    bool RateMissing);

/// <summary>Handler for <see cref="GetLateFeePreviewQuery"/>.</summary>
public sealed class GetLateFeePreviewQueryHandler(
    IGstReturnRepository repository,
    IGstLateFeeService lateFeeService)
    : IQueryHandler<GetLateFeePreviewQuery, LateFeePreviewDto>
{
    /// <inheritdoc />
    public async Task<Result<LateFeePreviewDto>> Handle(
        GetLateFeePreviewQuery request,
        CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Error.NotFound("GstReturn", request.GstReturnId);

        var asOf = request.AsOfDateTime ?? DateTime.UtcNow;
        var isNilReturn = gstReturn.NetTaxPayable == 0m && gstReturn.TotalTaxableValue == 0m;

        var penaltyResult = await lateFeeService.CalculateAsync(
            returnType: gstReturn.ReturnType,
            isNilReturn: isNilReturn,
            filingDeadline: gstReturn.FilingDeadline ?? DateOnly.FromDateTime(asOf),
            filedAt: asOf,
            netTaxPayable: gstReturn.NetTaxPayable,
            ct: cancellationToken);

        if (penaltyResult.IsFailure)
            return penaltyResult.Error;

        var p = penaltyResult.Value;

        return new LateFeePreviewDto(
            GstReturnId: gstReturn.Id,
            ReturnType: gstReturn.ReturnType,
            FilingDeadline: gstReturn.FilingDeadline,
            DaysLate: p.DaysLate,
            PerDayRate: p.PerDayRate,
            LateFeeAmount: p.LateFeeAmount,
            InterestRatePct: p.InterestRatePct,
            InterestAmount: p.InterestAmount,
            TotalPenaltyAmount: p.LateFeeAmount + p.InterestAmount,
            IsFiledOnTime: p.DaysLate == 0,
            RateMissing: p.DaysLate > 0 && p.PerDayRate == 0m);
    }
}
