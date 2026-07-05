using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.ApproveApplication;

/// <summary>
/// Approves a loan application (UNDER_REVIEW → APPROVED).
/// Admin endpoint: called when the bank confirms approval with a reference number.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ApproveApplicationCommand(
    Guid ApplicationId,
    string BankReferenceNo) : ICommand<ApproveApplicationResponse>;

/// <summary>Response after approving a loan application.</summary>
public record ApproveApplicationResponse(Guid ApplicationId, string Status, string BankReferenceNo);

/// <summary>Validates ApproveApplicationCommand.</summary>
public sealed class ApproveApplicationCommandValidator : AbstractValidator<ApproveApplicationCommand>
{
    public ApproveApplicationCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.BankReferenceNo).NotEmpty().MaximumLength(100)
            .WithMessage("Bank reference number is required for approval.");
    }
}

/// <summary>Handler: approves application with IDOR org-scoping and status log.</summary>
public sealed class ApproveApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<ApproveApplicationCommand, ApproveApplicationResponse>
{
    /// <inheritdoc />
    public async Task<Result<ApproveApplicationResponse>> Handle(
        ApproveApplicationCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();

        var transitionResult = application.Approve(request.BankReferenceNo);
        if (transitionResult.IsFailure)
            return Result<ApproveApplicationResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = $"Application approved. Bank reference: {request.BankReferenceNo}",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new ApproveApplicationResponse(application.Id, application.Status.ToString(), request.BankReferenceNo);
    }
}
