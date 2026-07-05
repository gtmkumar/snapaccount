using FluentValidation;
using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.BankCommunications.Commands.ResendBankMessage;

/// <summary>
/// Re-queues a bank communication message for resend.
/// Admin / DG-LOAN-01: POST /loans/bank-communications/{id}/resend
///
/// In this implementation "bank communication" entries are status log rows.
/// Resend adds a new status-log note entry recording the resend intent so the
/// admin can see the action was taken.  Actual re-delivery of emails/REST calls
/// depends on the adapter integration (TL-gated for prod; this records the attempt).
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ResendBankMessageCommand(
    Guid MessageId,
    string? Reason = null) : ICommand<ResendBankMessageResponse>;

/// <summary>Response after queueing resend.</summary>
public record ResendBankMessageResponse(Guid MessageId, string Status);

/// <summary>Validates ResendBankMessageCommand.</summary>
public sealed class ResendBankMessageCommandValidator : AbstractValidator<ResendBankMessageCommand>
{
    public ResendBankMessageCommandValidator()
    {
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500).When(x => x.Reason != null);
    }
}

/// <summary>Handler: records resend attempt in the status log.</summary>
public sealed class ResendBankMessageCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<ResendBankMessageCommand, ResendBankMessageResponse>
{
    /// <inheritdoc />
    public async Task<Result<ResendBankMessageResponse>> Handle(
        ResendBankMessageCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Find the original status log entry
        var original = await db.ApplicationStatusLogs
            .Where(l => l.Id == request.MessageId)
            .FirstOrDefaultAsync(cancellationToken);

        if (original == null)
            return Error.NotFound("BankCommMessage", request.MessageId);

        // IDOR: verify the application belongs to the caller's org
        var applicationExists = await db.LoanApplications
            .AnyAsync(
                a => a.Id == original.ApplicationId && a.OrgId == orgId && a.DeletedAt == null,
                cancellationToken);

        if (!applicationExists)
            return Error.NotFound("BankCommMessage", request.MessageId);

        // Record the resend attempt as a new audit entry (does not change application status)
        db.ApplicationStatusLogs.Add(new LoanService.Domain.Entities.ApplicationStatusLog
        {
            ApplicationId = original.ApplicationId,
            FromStatus = original.ToStatus,
            ToStatus = original.ToStatus,   // Status unchanged by resend
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = $"[RESEND] Original entry {request.MessageId}. Reason: {request.Reason ?? "manual resend"}",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);
        return new ResendBankMessageResponse(request.MessageId, "queued");
    }
}
