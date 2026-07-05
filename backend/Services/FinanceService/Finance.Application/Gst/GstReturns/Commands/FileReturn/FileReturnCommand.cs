using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.FileReturn;

/// <remarks>SEC-012: Requires CA/Admin permission to file a return.</remarks>
[RequiresPermission("gst.returns.file")]
public record FileReturnCommand(Guid GstReturnId, string ArnNumber) : ICommand<FileReturnResponse>;

/// <summary>
/// Response returned when a GST return is successfully filed.
/// DG-GST-04: includes late fee and interest amounts computed at filing time.
/// </summary>
/// <param name="GstReturnId">The filed return's ID.</param>
/// <param name="LateFeeAmount">Late fee in INR (0 when filed on time).</param>
/// <param name="InterestAmount">Interest in INR on net tax payable (0 when filed on time).</param>
/// <param name="DaysLate">Calendar days past the deadline (0 when on time).</param>
public record FileReturnResponse(
    Guid GstReturnId,
    decimal LateFeeAmount,
    decimal InterestAmount,
    int DaysLate);

/// <summary>
/// Transitions an APPROVED GST return to FILED status using the ARN received
/// from the GST portal. Publishes <c>GstReturnFiledEvent</c> via domain events.
/// DG-GST-02: appends a GstReturnAudit row recording the ARN capture.
/// DG-GST-04: calculates late fee and interest before filing; sets penalty amounts.
/// TODO Phase 2: Integrate with actual GST portal API to obtain ARN.
/// </summary>
public sealed class FileReturnCommandHandler(
    IGstReturnRepository repository,
    IGstDbContext dbContext,
    IGstLateFeeService lateFeeService,
    ICurrentUser currentUser,
    ILogger<FileReturnCommandHandler> logger)
    : ICommandHandler<FileReturnCommand, FileReturnResponse>
{
    /// <inheritdoc />
    public async Task<Result<FileReturnResponse>> Handle(
        FileReturnCommand request,
        CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Error.NotFound("GstReturn", request.GstReturnId);

        var previousStatus = gstReturn.Status;

        // DG-GST-04: calculate late fee and interest before calling File()
        // so the amounts are persisted atomically with the status transition.
        var now = DateTime.UtcNow;
        var penaltyResult = await lateFeeService.CalculateAsync(
            returnType: gstReturn.ReturnType,
            isNilReturn: gstReturn.NetTaxPayable == 0m && gstReturn.TotalTaxableValue == 0m,
            filingDeadline: gstReturn.FilingDeadline ?? DateOnly.FromDateTime(now),
            filedAt: now,
            netTaxPayable: gstReturn.NetTaxPayable,
            ct: cancellationToken);

        GstLateFeeResult penalties;
        if (penaltyResult.IsFailure)
        {
            // Non-blocking: log and proceed with zero amounts rather than blocking the filing.
            logger.LogWarning(
                "Late-fee calculation failed for GstReturn {Id}: {Error}. Proceeding with zero amounts.",
                request.GstReturnId, penaltyResult.Error.Message);
            penalties = new GstLateFeeResult(0m, 0m, 0, 0m, 0m);
        }
        else
        {
            penalties = penaltyResult.Value;
        }

        // Set penalty amounts on the aggregate
        var penaltiesSet = gstReturn.SetPenalties(penalties.LateFeeAmount, penalties.InterestAmount);
        if (penaltiesSet.IsFailure)
            return penaltiesSet.Error;

        // Transition to FILED status
        var fileResult = gstReturn.File(request.ArnNumber);
        if (fileResult.IsFailure)
            return fileResult.Error;

        await repository.UpdateAsync(gstReturn, cancellationToken);

        // DG-GST-02: append audit row — includes ARN in the arnReceived field
        var detailParts = new List<string>();
        if (penalties.DaysLate > 0)
            detailParts.Add($"Late by {penalties.DaysLate} days. LateFee=₹{penalties.LateFeeAmount:N2}, Interest=₹{penalties.InterestAmount:N2}");

        var audit = GstReturnAudit.RecordTransition(
            gstReturnId: gstReturn.Id,
            eventType: "FILED",
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email ?? "unknown",
            previousStatus: previousStatus,
            detail: detailParts.Count > 0 ? string.Join("; ", detailParts) : null,
            arn: request.ArnNumber);

        dbContext.GstReturnAudits.Add(audit);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new FileReturnResponse(
            GstReturnId: gstReturn.Id,
            LateFeeAmount: penalties.LateFeeAmount,
            InterestAmount: penalties.InterestAmount,
            DaysLate: penalties.DaysLate);
    }
}
