using AccountingService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.JournalBatches.Commands.ReviewPosting;

/// <summary>
/// Approves or rejects a <c>PENDING_REVIEW</c> ledger entry created from OCR.
/// SEC-026: requires accounting.journal.review permission.
/// </summary>
/// <param name="LedgerEntryId">ID of the ledger entry to review.</param>
/// <param name="Approve">True to approve; false to reject (which reverses the entry).</param>
/// <param name="ReviewerUserId">User ID of the CA/admin performing the review.</param>
[RequiresPermission("accounting.journal.review")]
public record ReviewPostingCommand(
    Guid LedgerEntryId,
    bool Approve,
    Guid ReviewerUserId) : ICommand;

/// <summary>Validates the review command.</summary>
public sealed class ReviewPostingCommandValidator : AbstractValidator<ReviewPostingCommand>
{
    public ReviewPostingCommandValidator()
    {
        RuleFor(x => x.LedgerEntryId).NotEmpty();
        RuleFor(x => x.ReviewerUserId).NotEmpty();
    }
}

/// <summary>Handles <see cref="ReviewPostingCommand"/>.</summary>
public sealed class ReviewPostingCommandHandler(ILedgerEntryRepository ledgerRepository)
    : ICommandHandler<ReviewPostingCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(ReviewPostingCommand request, CancellationToken cancellationToken)
    {
        var entry = await ledgerRepository.GetByIdAsync(request.LedgerEntryId, cancellationToken);
        if (entry is null)
            return Result.Failure(Error.NotFound("LedgerEntry", request.LedgerEntryId));

        var result = request.Approve
            ? entry.Approve(request.ReviewerUserId)
            : entry.Reverse(request.ReviewerUserId);

        if (result.IsFailure) return result;

        await ledgerRepository.UpdateAsync(entry, cancellationToken);
        return Result.Success();
    }
}
