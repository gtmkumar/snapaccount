using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
#pragma warning disable CS9113 // unused primary constructor parameter

namespace AccountingService.Application.JournalBatches.Commands.PostJournalBatch;

/// <summary>
/// Posts a manually-created journal batch to the ledger.
/// All entries in the batch must balance (sum of amounts debit == sum credit).
/// </summary>
/// <param name="OrgId">Organisation performing the posting.</param>
/// <param name="Description">Batch description for audit narration.</param>
/// <param name="PostingDate">Date of posting; used for FY/period mapping (IST Apr–Mar).</param>
/// <param name="Entries">Line items — must balance.</param>
public record PostJournalBatchCommand(
    Guid OrgId,
    string Description,
    DateOnly PostingDate,
    IReadOnlyList<JournalBatchLineRequest> Entries) : ICommand<PostJournalBatchResponse>;

/// <summary>One debit/credit pair within the batch request.</summary>
public record JournalBatchLineRequest(
    Guid DebitAccountId,
    Guid CreditAccountId,
    decimal Amount,
    string Narration);

/// <summary>Response returned after a successful posting.</summary>
public record PostJournalBatchResponse(Guid BatchId, string BatchNumber, decimal TotalAmount);

/// <summary>FluentValidation validator for <see cref="PostJournalBatchCommand"/>.</summary>
public sealed class PostJournalBatchCommandValidator : AbstractValidator<PostJournalBatchCommand>
{
    public PostJournalBatchCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Entries).NotEmpty().WithMessage("A batch must have at least one entry.");
        RuleForEach(x => x.Entries).ChildRules(e =>
        {
            e.RuleFor(l => l.DebitAccountId).NotEmpty();
            e.RuleFor(l => l.CreditAccountId).NotEmpty();
            e.RuleFor(l => l.Amount).GreaterThan(0).WithMessage("Amount must be positive.");
            e.RuleFor(l => l.Narration).NotEmpty().MaximumLength(500);
        });
    }
}

/// <summary>
/// Handles <see cref="PostJournalBatchCommand"/>. Creates a <see cref="JournalBatch"/>
/// aggregate, validates balance, and persists all <see cref="LedgerEntry"/> rows.
/// </summary>
public sealed class PostJournalBatchCommandHandler(
    IJournalBatchRepository batchRepository,
    ILedgerEntryRepository ledgerRepository)
    : ICommandHandler<PostJournalBatchCommand, PostJournalBatchResponse>
{
    /// <inheritdoc />
    public async Task<Result<PostJournalBatchResponse>> Handle(
        PostJournalBatchCommand request,
        CancellationToken cancellationToken)
    {
        var batchNumber = $"JB-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}";
        var batch = JournalBatch.Create(
            request.OrgId,
            batchNumber,
            request.Description,
            request.PostingDate,
            PostingSource.Manual);

        foreach (var line in request.Entries)
        {
            var entry = LedgerEntry.Create(
                request.OrgId,
                line.DebitAccountId,
                line.CreditAccountId,
                line.Amount,
                line.Narration,
                batch.FyYear,
                PeriodMonth(request.PostingDate),
                PostingSource.Manual,
                journalBatchId: batch.Id);

            batch.AddEntry(entry);
        }

        var validation = batch.Post();
        if (validation.IsFailure) return validation.Error;

        await batchRepository.AddAsync(batch, cancellationToken);

        foreach (var entry in batch.Entries)
            await ledgerRepository.AddAsync(entry, cancellationToken);

        return new PostJournalBatchResponse(batch.Id, batch.BatchNumber, batch.TotalDebit);
    }

    // Indian FY period: April=1, May=2, … March=12
    private static int PeriodMonth(DateOnly date) => date.Month >= 4 ? date.Month - 3 : date.Month + 9;
}
