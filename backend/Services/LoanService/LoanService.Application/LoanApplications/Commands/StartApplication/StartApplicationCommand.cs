using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Domain.Events;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.StartApplication;

/// <summary>
/// Creates a new loan application in DRAFT status for the current user's organisation.
/// </summary>
[RequiresPermission("loan.application.create")]
public record StartApplicationCommand(
    Guid LoanProductId,
    decimal RequestedAmount,
    int TenureMonths,
    string? Purpose) : ICommand<StartApplicationResponse>;

/// <summary>Response after starting a loan application.</summary>
public record StartApplicationResponse(Guid ApplicationId, string Status);

/// <summary>Validates StartApplicationCommand inputs.</summary>
public sealed class StartApplicationCommandValidator : AbstractValidator<StartApplicationCommand>
{
    public StartApplicationCommandValidator()
    {
        RuleFor(x => x.LoanProductId).NotEmpty();
        RuleFor(x => x.RequestedAmount).GreaterThan(0).LessThanOrEqualTo(50_00_00_000m)
            .WithMessage("Requested amount must be between ₹1 and ₹50 crore.");
        RuleFor(x => x.TenureMonths).InclusiveBetween(1, 360)
            .WithMessage("Tenure must be between 1 and 360 months.");
        RuleFor(x => x.Purpose).MaximumLength(1000);
    }
}

/// <summary>Handler: creates draft loan application with IDOR org-scoping.</summary>
public sealed class StartApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<StartApplicationCommand, StartApplicationResponse>
{
    /// <inheritdoc />
    public async Task<Result<StartApplicationResponse>> Handle(
        StartApplicationCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<StartApplicationResponse>.Failure(
                Error.Validation("LoanApplication.NoOrg", "User is not associated with an organisation."));

        var orgId = currentUser.OrganizationId.Value;

        // Verify loan product exists
        var product = await db.LoanProducts.FindAsync([request.LoanProductId], cancellationToken);
        if (product == null || !product.IsActive)
            return Error.NotFound("LoanProduct", request.LoanProductId);

        var application = new LoanApplication
        {
            OrgId = orgId,
            UserId = currentUser.UserId,
            LoanProductId = request.LoanProductId,
            RequestedAmount = request.RequestedAmount,
            TenureMonths = request.TenureMonths,
            Purpose = request.Purpose
        };

        application.AddDomainEvent(new LoanApplicationStartedEvent(application.Id, orgId));

        db.LoanApplications.Add(application);

        // P6-HANDOFF-28: insert status_log row in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = string.Empty,
            ToStatus = LoanApplicationStatus.Draft.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = "Application started",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);

        return new StartApplicationResponse(application.Id, application.Status.ToString());
    }
}
