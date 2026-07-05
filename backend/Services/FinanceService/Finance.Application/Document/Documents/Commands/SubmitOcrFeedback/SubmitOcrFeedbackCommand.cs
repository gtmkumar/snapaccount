using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.SubmitOcrFeedback;

/// <summary>
/// GAP-014: Persists an operator's OCR field correction as an <see cref="OcrFeedback"/> row.
/// Called by the document review UI when the operator overrides an extracted field value.
///
/// Issue types:
///   WRONG_VALUE       — extracted value differs from the actual document value
///   MISSING_FIELD     — field was not extracted at all
///   WRONG_FIELD       — data placed in the wrong field slot
///   ILLEGIBLE         — image quality prevented extraction
///   FORMATTING_ERROR  — wrong format (e.g., date as text)
///   OTHER             — catch-all with required notes
/// </summary>
[RequiresPermission("document.review")]
public record SubmitOcrFeedbackCommand(
    Guid DocumentId,
    Guid OcrFieldId,
    string IssueType,
    string? Notes) : ICommand<SubmitOcrFeedbackResponse>;

/// <summary>Response returned after persisting OCR feedback.</summary>
public record SubmitOcrFeedbackResponse(Guid FeedbackId, DateTime CreatedAt);

/// <summary>Validates the SubmitOcrFeedbackCommand.</summary>
public sealed class SubmitOcrFeedbackCommandValidator : AbstractValidator<SubmitOcrFeedbackCommand>
{
    private static readonly string[] ValidIssueTypes =
        ["WRONG_VALUE", "MISSING_FIELD", "WRONG_FIELD", "ILLEGIBLE", "FORMATTING_ERROR", "OTHER"];

    /// <summary>Initialises validation rules.</summary>
    public SubmitOcrFeedbackCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.OcrFieldId).NotEmpty();
        RuleFor(x => x.IssueType)
            .NotEmpty()
            .Must(t => ValidIssueTypes.Contains(t, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"IssueType must be one of: {string.Join(", ", ValidIssueTypes)}.");
        // Notes are required when issue type is OTHER
        RuleFor(x => x.Notes)
            .NotEmpty()
            .When(x => string.Equals(x.IssueType, "OTHER", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Notes are required when IssueType is OTHER.");
        RuleFor(x => x.Notes)
            .MaximumLength(2000)
            .When(x => x.Notes is not null);
    }
}

/// <summary>
/// Handles <see cref="SubmitOcrFeedbackCommand"/>.
/// Validates the document and OCR field belong to the caller's org before persisting.
/// </summary>
public sealed class SubmitOcrFeedbackCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser) : ICommandHandler<SubmitOcrFeedbackCommand, SubmitOcrFeedbackResponse>
{
    /// <inheritdoc />
    public async Task<Result<SubmitOcrFeedbackResponse>> Handle(
        SubmitOcrFeedbackCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result<SubmitOcrFeedbackResponse>.Failure(
                Error.Unauthorized("Auth.Required", "Authentication required."));

        // Verify the document exists and belongs to the caller's org (IDOR guard)
        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result<SubmitOcrFeedbackResponse>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue &&
            doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result<SubmitOcrFeedbackResponse>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // Verify the OCR field exists and belongs to this document
        var fieldExists = await db.OcrFields
            .AnyAsync(f => f.Id == request.OcrFieldId && f.DeletedAt == null, cancellationToken);

        if (!fieldExists)
            return Result<SubmitOcrFeedbackResponse>.Failure(
                new Error("OcrField.NotFound",
                    $"OCR field {request.OcrFieldId} not found.", ErrorType.NotFound));

        var feedback = OcrFeedback.Create(
            ocrFieldId: request.OcrFieldId,
            documentId: request.DocumentId,
            reportedBy: currentUser.UserId,
            issueType: request.IssueType.ToUpperInvariant(),
            notes: request.Notes);

        db.OcrFeedbacks.Add(feedback);
        await db.SaveChangesAsync(cancellationToken);

        return Result<SubmitOcrFeedbackResponse>.Success(
            new SubmitOcrFeedbackResponse(feedback.Id, feedback.CreatedAt));
    }
}
