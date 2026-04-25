using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RecordDisbursement;

/// <summary>
/// Records loan disbursement (typically triggered by the disbursement webhook handler).
/// Publishes LoanDisbursedEvent to snapaccount.loan.events topic.
/// </summary>
[RequiresPermission("loan.disbursement.record")]
public record RecordDisbursementCommand(
    Guid ApplicationId,
    decimal DisbursedAmount,
    string BankReferenceNo) : ICommand<RecordDisbursementResponse>;

/// <summary>Response after recording disbursement.</summary>
public record RecordDisbursementResponse(Guid ApplicationId, string Status, DateTime DisbursedAt);

/// <summary>Validates RecordDisbursementCommand.</summary>
public sealed class RecordDisbursementCommandValidator : AbstractValidator<RecordDisbursementCommand>
{
    public RecordDisbursementCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.DisbursedAmount).GreaterThan(0);
        RuleFor(x => x.BankReferenceNo).NotEmpty().MaximumLength(100);
    }
}

/// <summary>Handler: records disbursement, logs transition, publishes event.</summary>
public sealed class RecordDisbursementCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    ILoanEventPublisher pubSubPublisher) : ICommandHandler<RecordDisbursementCommand, RecordDisbursementResponse>
{
    private const string LoanEventsTopic = "snapaccount.loan.events";

    /// <inheritdoc />
    public async Task<Result<RecordDisbursementResponse>> Handle(
        RecordDisbursementCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();
        var result = application.RecordDisbursement(request.DisbursedAmount, request.BankReferenceNo);
        if (result.IsFailure)
            return Result<RecordDisbursementResponse>.Failure(result.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = $"Disbursed ₹{request.DisbursedAmount:N2}. BankRef: {request.BankReferenceNo}",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);

        // Publish event for NotificationService (P6-HANDOFF-34)
        await pubSubPublisher.PublishAsync(LoanEventsTopic, new
        {
            EventType = "LoanDisbursed",
            ApplicationId = application.Id,
            OrgId = application.OrgId,
            DisbursedAmount = request.DisbursedAmount,
            OccurredAt = DateTime.UtcNow
        }, cancellationToken);

        return new RecordDisbursementResponse(
            application.Id,
            application.Status.ToString(),
            application.DisbursedAt!.Value);
    }
}
