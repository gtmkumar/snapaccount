using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RequestDocuments;

/// <summary>
/// Requests additional documents from the applicant (UNDER_REVIEW → DOCS_REQUESTED).
/// Admin endpoint: called when the bank or admin officer needs more documentation.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record RequestDocumentsCommand(
    Guid ApplicationId,
    string? Note = null) : ICommand<RequestDocumentsResponse>;

/// <summary>Response after requesting documents.</summary>
public record RequestDocumentsResponse(Guid ApplicationId, string Status);

/// <summary>Validates RequestDocumentsCommand.</summary>
public sealed class RequestDocumentsCommandValidator : AbstractValidator<RequestDocumentsCommand>
{
    public RequestDocumentsCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(1000).When(x => x.Note != null);
    }
}

/// <summary>Handler: transitions application to DOCS_REQUESTED with IDOR org-scoping and status log.</summary>
public sealed class RequestDocumentsCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RequestDocumentsCommand, RequestDocumentsResponse>
{
    /// <inheritdoc />
    public async Task<Result<RequestDocumentsResponse>> Handle(
        RequestDocumentsCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();

        var transitionResult = application.RequestDocuments();
        if (transitionResult.IsFailure)
            return Result<RequestDocumentsResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = request.Note ?? "Additional documents requested by admin officer.",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new RequestDocumentsResponse(application.Id, application.Status.ToString());
    }
}
