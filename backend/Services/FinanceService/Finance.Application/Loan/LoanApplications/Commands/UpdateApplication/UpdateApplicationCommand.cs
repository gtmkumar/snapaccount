using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.UpdateApplication;

/// <summary>Updates a DRAFT loan application. Only allowed in DRAFT status.</summary>
[RequiresPermission("loan.application.update")]
public record UpdateApplicationCommand(
    Guid ApplicationId,
    decimal? RequestedAmount,
    int? TenureMonths,
    string? Purpose) : ICommand<UpdateApplicationResponse>;

/// <summary>Response after updating a loan application.</summary>
public record UpdateApplicationResponse(Guid ApplicationId, string Status);

/// <summary>Validates UpdateApplicationCommand inputs.</summary>
public sealed class UpdateApplicationCommandValidator : AbstractValidator<UpdateApplicationCommand>
{
    public UpdateApplicationCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        When(x => x.RequestedAmount.HasValue, () =>
            RuleFor(x => x.RequestedAmount!.Value)
                .GreaterThan(0)
                .LessThanOrEqualTo(50_00_00_000m));
        When(x => x.TenureMonths.HasValue, () =>
            RuleFor(x => x.TenureMonths!.Value).InclusiveBetween(1, 360));
        RuleFor(x => x.Purpose).MaximumLength(1000);
    }
}

/// <summary>Handler: updates draft application with IDOR org-scoping.</summary>
public sealed class UpdateApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<UpdateApplicationCommand, UpdateApplicationResponse>
{
    /// <inheritdoc />
    public async Task<Result<UpdateApplicationResponse>> Handle(
        UpdateApplicationCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: filter by org before fetching
        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        if (application.Status != LoanApplicationStatus.Draft)
            return Result<UpdateApplicationResponse>.Failure(
                Error.Conflict("LoanApplication.NotDraft",
                    "Application can only be updated in DRAFT status."));

        if (request.RequestedAmount.HasValue)
            application.RequestedAmount = request.RequestedAmount.Value;
        if (request.TenureMonths.HasValue)
            application.TenureMonths = request.TenureMonths.Value;
        if (request.Purpose != null)
            application.Purpose = request.Purpose;

        await db.SaveChangesAsync(cancellationToken);
        return new UpdateApplicationResponse(application.Id, application.Status.ToString());
    }
}
