using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RecordBankDecision;

/// <summary>Records a bank's decision (Approve/Reject/RequestDocs) on a loan application.</summary>
[RequiresPermission("loan.bank.decision")]
public record RecordBankDecisionCommand(
    Guid ApplicationId,
    BankDecision Decision,
    string? BankReferenceNo,
    string? Reason) : ICommand<RecordBankDecisionResponse>;

/// <summary>Possible bank decisions.</summary>
public enum BankDecision { Approve, Reject, RequestDocuments }

/// <summary>Response after recording bank decision.</summary>
public record RecordBankDecisionResponse(Guid ApplicationId, string Status);

/// <summary>Validates RecordBankDecisionCommand.</summary>
public sealed class RecordBankDecisionCommandValidator : AbstractValidator<RecordBankDecisionCommand>
{
    public RecordBankDecisionCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.Decision).IsInEnum();
        When(x => x.Decision == BankDecision.Reject, () =>
            RuleFor(x => x.Reason).NotEmpty()
                .WithMessage("Rejection reason is required."));
    }
}

/// <summary>Handler: records bank decision with IDOR org-scoping and status log.</summary>
public sealed class RecordBankDecisionCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RecordBankDecisionCommand, RecordBankDecisionResponse>
{
    /// <inheritdoc />
    public async Task<Result<RecordBankDecisionResponse>> Handle(
        RecordBankDecisionCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();

        Result transitionResult = request.Decision switch
        {
            BankDecision.Approve => application.Approve(request.BankReferenceNo ?? string.Empty),
            BankDecision.Reject => application.Reject(request.Reason ?? string.Empty),
            BankDecision.RequestDocuments => application.RequestDocuments(),
            _ => Result.Failure(Error.Validation("BankDecision.Unknown", "Unknown decision type."))
        };

        if (transitionResult.IsFailure)
            return Result<RecordBankDecisionResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = request.Reason ?? $"Bank decision: {request.Decision}. Ref: {request.BankReferenceNo}",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new RecordBankDecisionResponse(application.Id, application.Status.ToString());
    }
}
