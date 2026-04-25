using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.JournalBatches.Commands.PostFromOcr;

/// <summary>
/// Posts a ledger entry originating from Google Document AI OCR extraction.
/// Called by <c>OcrResultSubscriber</c> (hosted service subscribing to Pub/Sub
/// topic <c>snapaccount.document.ocr.completed</c> / subscription <c>accounting-service-ocr-sub</c>).
/// <para>P6-HANDOFF-03: <see cref="DedupeHash"/> must be set by the caller as
/// SHA-256(document_id || extracted_payload_hash). The partial unique index on
/// <c>accounting.ledger_entries.dedupe_hash</c> enforces idempotency.</para>
/// </summary>
public record PostFromOcrCommand(
    Guid OrgId,
    Guid DocumentId,
    Guid DebitAccountId,
    Guid CreditAccountId,
    decimal Amount,
    string Narration,
    int FyYear,
    int PeriodMonth,
    string DedupeHash) : ICommand<PostFromOcrResponse>;

/// <summary>Response after a successful OCR-sourced posting.</summary>
public record PostFromOcrResponse(Guid LedgerEntryId, bool WasDuplicate);

/// <summary>Validates the OCR post command.</summary>
public sealed class PostFromOcrCommandValidator : AbstractValidator<PostFromOcrCommand>
{
    public PostFromOcrCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.DebitAccountId).NotEmpty();
        RuleFor(x => x.CreditAccountId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0);
        RuleFor(x => x.Narration).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
        RuleFor(x => x.PeriodMonth).InclusiveBetween(1, 12);
        RuleFor(x => x.DedupeHash).NotEmpty().Length(64); // SHA-256 hex = 64 chars
    }
}

/// <summary>
/// Handles <see cref="PostFromOcrCommand"/>. Checks for an existing entry with the
/// same <c>dedupe_hash</c> before persisting (idempotent on Pub/Sub redelivery).
/// </summary>
public sealed class PostFromOcrCommandHandler(
    ILedgerEntryRepository ledgerRepository)
    : ICommandHandler<PostFromOcrCommand, PostFromOcrResponse>
{
    /// <inheritdoc />
    public async Task<Result<PostFromOcrResponse>> Handle(
        PostFromOcrCommand request,
        CancellationToken cancellationToken)
    {
        // Idempotency check — Pub/Sub at-least-once delivery guard
        var existing = await ledgerRepository.GetByDedupeHashAsync(request.DedupeHash, cancellationToken);
        if (existing is not null)
            return new PostFromOcrResponse(existing.Id, WasDuplicate: true);

        var entry = LedgerEntry.Create(
            request.OrgId,
            request.DebitAccountId,
            request.CreditAccountId,
            request.Amount,
            request.Narration,
            request.FyYear,
            request.PeriodMonth,
            PostingSource.Ocr,
            documentId: request.DocumentId,
            dedupeHash: request.DedupeHash);

        await ledgerRepository.AddAsync(entry, cancellationToken);
        return new PostFromOcrResponse(entry.Id, WasDuplicate: false);
    }
}
