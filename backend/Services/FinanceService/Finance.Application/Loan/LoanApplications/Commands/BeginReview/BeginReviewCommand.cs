using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.BeginReview;

/// <summary>
/// Transitions a loan application from SUBMITTED to UNDER_REVIEW.
/// Called by admin officers to indicate active review has started.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record BeginReviewCommand(Guid ApplicationId) : ICommand<BeginReviewResponse>;

/// <summary>Response after beginning review.</summary>
public record BeginReviewResponse(Guid ApplicationId, string Status);

/// <summary>Validates BeginReviewCommand.</summary>
public sealed class BeginReviewCommandValidator : AbstractValidator<BeginReviewCommand>
{
    public BeginReviewCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
    }
}

/// <summary>Handler: transitions application to UNDER_REVIEW with org-scoping and status log.</summary>
public sealed class BeginReviewCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<BeginReviewCommand, BeginReviewResponse>
{
    /// <inheritdoc />
    public async Task<Result<BeginReviewResponse>> Handle(
        BeginReviewCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();

        var transitionResult = application.BeginReview();
        if (transitionResult.IsFailure)
            return Result<BeginReviewResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = "Review started by admin officer.",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new BeginReviewResponse(application.Id, application.Status.ToString());
    }
}
