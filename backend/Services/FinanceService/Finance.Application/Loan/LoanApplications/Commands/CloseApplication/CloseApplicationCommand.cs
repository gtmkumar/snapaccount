using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.CloseApplication;

/// <summary>Closes a disbursed or rejected loan application.</summary>
[RequiresPermission("loan.application.close")]
public record CloseApplicationCommand(Guid ApplicationId) : ICommand<CloseApplicationResponse>;

/// <summary>Response after closing a loan application.</summary>
public record CloseApplicationResponse(Guid ApplicationId, string Status);

/// <summary>Validates CloseApplicationCommand.</summary>
public sealed class CloseApplicationCommandValidator : AbstractValidator<CloseApplicationCommand>
{
    public CloseApplicationCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
    }
}

/// <summary>Handler: closes application with IDOR org-scoping and status log.</summary>
public sealed class CloseApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CloseApplicationCommand, CloseApplicationResponse>
{
    /// <inheritdoc />
    public async Task<Result<CloseApplicationResponse>> Handle(
        CloseApplicationCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var fromStatus = application.Status.ToString();
        var result = application.Close();
        if (result.IsFailure)
            return Result<CloseApplicationResponse>.Failure(result.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = "Application closed",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new CloseApplicationResponse(application.Id, application.Status.ToString());
    }
}
