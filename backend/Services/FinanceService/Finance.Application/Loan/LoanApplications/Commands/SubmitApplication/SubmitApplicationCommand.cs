using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.SubmitApplication;

/// <summary>
/// Submits a DRAFT loan application for bank review.
/// All 3 consent types must be recorded before submission is allowed.
/// </summary>
[RequiresPermission("loan.application.submit")]
public record SubmitApplicationCommand(Guid ApplicationId) : ICommand<SubmitApplicationResponse>;

/// <summary>Response after submitting a loan application.</summary>
public record SubmitApplicationResponse(Guid ApplicationId, string Status, DateTime SubmittedAt);

/// <summary>Validates SubmitApplicationCommand.</summary>
public sealed class SubmitApplicationCommandValidator : AbstractValidator<SubmitApplicationCommand>
{
    public SubmitApplicationCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
    }
}

/// <summary>Handler: validates consents and the fraud pre-check gate, submits application, logs status transition.</summary>
public sealed class SubmitApplicationCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    IFraudCheckConfig fraudConfig) : ICommandHandler<SubmitApplicationCommand, SubmitApplicationResponse>
{
    private static readonly ConsentType[] RequiredConsents =
    [
        ConsentType.CreditBureau,
        ConsentType.DataShareWithBank,
        ConsentType.DisbursementMandate
    ];

    /// <inheritdoc />
    public async Task<Result<SubmitApplicationResponse>> Handle(
        SubmitApplicationCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: filter by org
        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        // Validate all required consents are present
        var consentTypes = await db.Consents
            .Where(c => c.ApplicationId == request.ApplicationId && c.DeletedAt == null)
            .Select(c => c.ConsentType)
            .ToListAsync(cancellationToken);

        var missingConsents = RequiredConsents.Except(consentTypes).ToList();
        if (missingConsents.Count > 0)
            return Result<SubmitApplicationResponse>.Failure(
                Error.Validation("LoanApplication.MissingConsents",
                    $"Missing required consents: {string.Join(", ", missingConsents)}"));

        // ── GAP-110: Fraud pre-submission gate ────────────────────────────────
        // The fraud pre-check (POST /loans/applications/{id}/fraud-check) persists one
        // FraudCheck row per check type. We evaluate the LATEST verdict per check type so a
        // re-run that now passes supersedes an earlier Fail (legitimate resubmission).
        //   • A latest-verdict Fail on any check ALWAYS blocks submission — defence in depth,
        //     independent of the soft-launch flag.
        //   • When FraudCheck:EnforceOnSubmit is true, submission additionally requires that the
        //     pre-check has been run at all (≥1 row); otherwise it is blocked.
        var fraudChecks = await db.FraudChecks
            .Where(fc => fc.ApplicationId == request.ApplicationId)
            .ToListAsync(cancellationToken);

        if (fraudConfig.EnforceOnSubmit && fraudChecks.Count == 0)
            return Result<SubmitApplicationResponse>.Failure(
                Error.Validation("LoanApplication.FraudCheckRequired",
                    "Run the fraud pre-check (POST /loans/applications/{id}/fraud-check) before submitting this application."));

        var latestFailedChecks = fraudChecks
            .GroupBy(fc => fc.CheckType)
            .Select(g => g.OrderByDescending(fc => fc.CheckedAt).First())
            .Where(fc => fc.Verdict == FraudVerdict.Fail)
            .ToList();

        if (latestFailedChecks.Count > 0)
            return Result<SubmitApplicationResponse>.Failure(
                Error.Validation("LoanApplication.FraudCheckFailed",
                    "Submission blocked by fraud pre-check: " +
                    string.Join("; ", latestFailedChecks.Select(fc => fc.DecisionNote))));

        var fromStatus = application.Status.ToString();
        var transitionResult = application.Submit();
        if (transitionResult.IsFailure)
            return Result<SubmitApplicationResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = "Application submitted by user",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new SubmitApplicationResponse(application.Id, application.Status.ToString(), application.SubmittedAt!.Value);
    }
}
