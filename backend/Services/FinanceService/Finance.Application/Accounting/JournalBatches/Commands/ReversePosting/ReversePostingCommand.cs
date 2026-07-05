using AccountingService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.JournalBatches.Commands.ReversePosting;

/// <summary>
/// Reverses an APPROVED ledger entry.
/// SEC-026: requires accounting.journal.reverse permission.
/// </summary>
[RequiresPermission("accounting.journal.reverse")]
public record ReversePostingCommand(Guid LedgerEntryId, Guid ReviewerUserId) : ICommand;

/// <summary>Validates the reverse command.</summary>
public sealed class ReversePostingCommandValidator : AbstractValidator<ReversePostingCommand>
{
    public ReversePostingCommandValidator()
    {
        RuleFor(x => x.LedgerEntryId).NotEmpty();
        RuleFor(x => x.ReviewerUserId).NotEmpty();
    }
}

/// <summary>Handles <see cref="ReversePostingCommand"/>.</summary>
public sealed class ReversePostingCommandHandler(ILedgerEntryRepository ledgerRepository)
    : ICommandHandler<ReversePostingCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(ReversePostingCommand request, CancellationToken cancellationToken)
    {
        var entry = await ledgerRepository.GetByIdAsync(request.LedgerEntryId, cancellationToken);
        if (entry is null)
            return Result.Failure(Error.NotFound("LedgerEntry", request.LedgerEntryId));

        var result = entry.Reverse(request.ReviewerUserId);
        if (result.IsFailure) return result;

        await ledgerRepository.UpdateAsync(entry, cancellationToken);
        return Result.Success();
    }
}
