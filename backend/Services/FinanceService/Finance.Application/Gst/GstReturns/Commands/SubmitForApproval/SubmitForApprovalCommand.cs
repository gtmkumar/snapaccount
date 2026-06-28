using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.SubmitForApproval;

public record SubmitForApprovalCommand(Guid GstReturnId) : ICommand;

/// <summary>
/// Transitions a GST return from DRAFT to PENDING_APPROVAL status.
/// Enforces the domain state machine via <see cref="GstReturn.SubmitForApproval"/>.
/// DG-GST-01: rejects submission when return totals are still all-zero but invoices exist,
/// indicating the calculation pipeline was bypassed or data is corrupt.
/// Nil returns (no invoices, all totals zero) are explicitly allowed through.
/// DG-GST-02: appends a GstReturnAudit row on every successful state transition.
/// </summary>
public sealed class SubmitForApprovalCommandHandler(
    IGstReturnRepository repository,
    IGstDbContext dbContext,
    ICurrentUser currentUser)
    : ICommandHandler<SubmitForApprovalCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(SubmitForApprovalCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var previousStatus = gstReturn.Status;

        // DG-GST-01: Guard — if the return has invoices but totals are still zero,
        // the calculation engine was not invoked. Reject and surface a clear error
        // so the caller knows to trigger recalculation before submitting.
        // Nil returns (zero invoices, zero totals) are explicitly allowed through —
        // they represent a legitimate "no activity" filing period.
        var isZeroTotals = gstReturn.TotalTaxableValue == 0m
            && gstReturn.TotalIgst == 0m
            && gstReturn.TotalCgst == 0m
            && gstReturn.TotalSgst == 0m
            && gstReturn.TotalCess == 0m;

        if (isZeroTotals)
        {
            var hasInvoices = await dbContext.GstInvoices
                .AnyAsync(i => i.GstReturnId == request.GstReturnId, cancellationToken);

            if (hasInvoices)
                return Result.Failure(Error.Validation(
                    "GstReturn.TotalsNotComputed",
                    "Return has invoices but computed totals are all zero. " +
                    "Add or re-save an invoice to trigger recalculation before submitting."));
        }

        var result = gstReturn.SubmitForApproval(currentUser.UserId);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);

        // DG-GST-02: append audit row for the state transition
        var audit = GstReturnAudit.RecordTransition(
            gstReturnId: gstReturn.Id,
            eventType: "SUBMITTED",
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email ?? "unknown",
            previousStatus: previousStatus);

        dbContext.GstReturnAudits.Add(audit);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
