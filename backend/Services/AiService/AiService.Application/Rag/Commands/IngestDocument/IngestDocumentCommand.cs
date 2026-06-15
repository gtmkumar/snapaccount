using FluentValidation;
using SnapAccount.Shared.Application;

namespace AiService.Application.Rag.Commands.IngestDocument;

/// <summary>
/// Ingests a document into the RAG pipeline.
/// Triggered by the <c>snapaccount.document.ocr.completed</c> Pub/Sub topic via the
/// <c>ai-service-rag-sub</c> subscription (separate subscription from the accounting one —
/// same topic, different subscription, no interference with AccountingService).
/// Pipeline: chunk (512-token target, 64-token overlap) → embed → upsert ai.chunks + ai.embeddings.
/// </summary>
/// <param name="DocumentId">The approved document to ingest.</param>
/// <param name="OrganizationId">Owning organisation (for RLS scoping).</param>
/// <param name="OcrText">Full OCR text of the document (provided by the Pub/Sub payload).</param>
public record IngestDocumentCommand(
    Guid DocumentId,
    Guid OrganizationId,
    string OcrText) : ICommand;

/// <summary>FluentValidation for <see cref="IngestDocumentCommand"/>.</summary>
public sealed class IngestDocumentCommandValidator : AbstractValidator<IngestDocumentCommand>
{
    public IngestDocumentCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.OcrText)
            .NotEmpty().WithMessage("ocrText is required for RAG ingestion.")
            .MaximumLength(500_000).WithMessage("ocrText exceeds 500k character safety limit.");
    }
}
