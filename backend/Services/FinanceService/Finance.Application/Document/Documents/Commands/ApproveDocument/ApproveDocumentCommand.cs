using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace DocumentService.Application.Documents.Commands.ApproveDocument;

/// <summary>
/// Transitions a reviewed document to APPROVED and publishes the
/// <c>snapaccount.document.ocr.completed</c> event so AccountingService
/// can post the corresponding journal entry.
/// Valid source statuses: OCR_COMPLETE, IN_REVIEW.
/// Idempotent: approving an already-APPROVED document returns success without re-emitting.
/// </summary>
[RequiresPermission("document.review")]
public record ApproveDocumentCommand(Guid DocumentId) : ICommand;

/// <summary>Validates the ApproveDocumentCommand.</summary>
public sealed class ApproveDocumentCommandValidator : AbstractValidator<ApproveDocumentCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public ApproveDocumentCommandValidator() => RuleFor(x => x.DocumentId).NotEmpty();
}

/// <summary>
/// Handles <see cref="ApproveDocumentCommand"/>.
/// Org-scopes the document lookup (IDOR guard), enforces state transition rules,
/// publishes the accounting event, and pushes a SignalR DocumentStatusChanged event
/// (DG-DOC-07) to the document owner's client so mobile can stop polling.
/// </summary>
public sealed class ApproveDocumentCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser,
    IDocumentEventPublisher eventPublisher,
    IDocumentHubNotifier? hubNotifier = null) : ICommandHandler<ApproveDocumentCommand>
{
    /// <summary>Valid inbound statuses for the approve transition.</summary>
    private static readonly IReadOnlySet<string> ApprovableStatuses =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "OCR_COMPLETE", "IN_REVIEW" };

    /// <summary>
    /// Extracts the raw OCR text from the latest <c>document.ocr_result</c> row for
    /// the given document. Returns null when no OCR result exists.
    ///
    /// The raw text is extracted from the JSON <c>raw_response</c> column by looking
    /// for a top-level <c>"text"</c> or <c>"rawText"</c> key. If neither key is present
    /// the entire JSON is returned as-is so downstream consumers can still attempt
    /// extraction. This is best-effort: a null/empty return is safe — the RAG
    /// subscriber skips ingestion rather than failing.
    /// </summary>
    private static async Task<string?> ExtractOcrTextAsync(
        IDocumentDbContext db, Guid documentId, CancellationToken ct)
    {
        // Best-effort: if any async LINQ operation fails (e.g., in unit test mock contexts)
        // return null — null OcrText means the RAG subscriber uses its fallback fetch path.
        string? rawResponse = null;
        try
        {
            rawResponse = await db.OcrResults
                .Where(r => r.DocumentId == documentId && r.DeletedAt == null)
                .OrderByDescending(r => r.ProcessedAt)
                .Select(r => r.RawResponse)
                .FirstOrDefaultAsync(ct);
        }
        catch (InvalidOperationException)
        {
            // Mock IQueryable providers may not support async scalar projections.
            // Return null so consumers use their fallback path.
            return null;
        }

        if (string.IsNullOrWhiteSpace(rawResponse))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(rawResponse);
            // Prefer a "text" key if the provider put the full text there.
            foreach (var key in new[] { "text", "rawText", "full_text", "content" })
            {
                if (doc.RootElement.TryGetProperty(key, out var textElement)
                    && textElement.ValueKind == JsonValueKind.String)
                {
                    var value = textElement.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                        return value;
                }
            }

            // Fall back: return raw JSON so consumer can attempt its own extraction.
            return rawResponse;
        }
        catch
        {
            // If rawResponse is plain text (not JSON), return it directly.
            return rawResponse;
        }
    }

    /// <inheritdoc />
    public async Task<Result> Handle(ApproveDocumentCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // SEC-IDOR: org-scope guard — document must belong to the caller's org.
        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // Idempotency: already approved — return success, no re-emit.
        if (doc.Status == "APPROVED")
            return Result.Success();

        // State guard: only OCR_COMPLETE / IN_REVIEW can be approved.
        if (!ApprovableStatuses.Contains(doc.Status))
            return Result.Failure(Error.Validation("Document.InvalidTransition",
                $"Document cannot be approved from status '{doc.Status}'. " +
                $"Expected: {string.Join(" or ", ApprovableStatuses)}."));

        doc.Approve(currentUser.UserId);
        await db.SaveChangesAsync(cancellationToken);

        // Look up the latest OCR result raw text to include in the Pub/Sub envelope.
        // Consumers (RagIngestionSubscriber) prefer the payload field to avoid re-fetching.
        // Falls back to null when no OCR result exists (documents approved without OCR pass null).
        var ocrText = await ExtractOcrTextAsync(db, doc.Id, cancellationToken);

        // Publish accounting event — best-effort (failure is logged, not rethrown).
        await eventPublisher.PublishOcrCompletedAsync(doc, ocrText, cancellationToken);

        // DG-DOC-07: Push real-time status change to the document owner's mobile client.
        // Best-effort: if hubNotifier is null (e.g., tests) or push fails, polling is the fallback.
        if (hubNotifier is not null && doc.UserId.HasValue)
        {
            await hubNotifier.NotifyStatusChangedAsync(doc.Id, doc.UserId.Value, doc.Status, cancellationToken);
        }

        return Result.Success();
    }
}
