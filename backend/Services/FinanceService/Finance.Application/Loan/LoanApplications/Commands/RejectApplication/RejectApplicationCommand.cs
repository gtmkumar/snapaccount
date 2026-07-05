using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RejectApplication;

/// <summary>
/// Rejects a loan application (UNDER_REVIEW | DOCS_REQUESTED → REJECTED).
/// Admin endpoint: called when the bank or admin officer rejects the application.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record RejectApplicationCommand(
    Guid ApplicationId,
    string Reason) : ICommand<RejectApplicationResponse>;

/// <summary>Response after rejecting a loan application.</summary>
public record RejectApplicationResponse(Guid ApplicationId, string Status);

/// <summary>Validates RejectApplicationCommand.</summary>
public sealed class RejectApplicationCommandValidator : AbstractValidator<RejectApplicationCommand>
{
    public RejectApplicationCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(1000)
            .WithMessage("Rejection reason is required.");
    }
}

/// <summary>Handler: rejects application with IDOR org-scoping and status log.</summary>
public sealed class RejectApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RejectApplicationCommand, RejectApplicationResponse>
{
    /// <inheritdoc />
    public async Task<Result<RejectApplicationResponse>> Handle(
        RejectApplicationCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();

        var transitionResult = application.Reject(request.Reason);
        if (transitionResult.IsFailure)
            return Result<RejectApplicationResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = request.Reason,
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new RejectApplicationResponse(application.Id, application.Status.ToString());
    }
}
