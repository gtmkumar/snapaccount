using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.ItcReconciliation.Commands.ReconcileItc;

public record ReconcileItcCommand(
    Guid OrganizationId,
    string FinancialYear,
    int PeriodMonth,
    string ReconciliationType) : ICommand;

public sealed class ReconcileItcCommandHandler : ICommandHandler<ReconcileItcCommand>
{
    public Task<Result> Handle(ReconcileItcCommand request, CancellationToken cancellationToken)
        => throw new NotImplementedException(
            "TODO: Download GSTR-2A/2B from GST portal, compare with books, " +
            "create ItcMismatch records, publish ItcMismatchDetectedEvent.");
}
