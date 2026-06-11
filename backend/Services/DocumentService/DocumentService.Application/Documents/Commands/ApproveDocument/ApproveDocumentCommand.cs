using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

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
/// and publishes the accounting event on a successful approval.
/// </summary>
public sealed class ApproveDocumentCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser,
    IDocumentEventPublisher eventPublisher) : ICommandHandler<ApproveDocumentCommand>
{
    /// <summary>Valid inbound statuses for the approve transition.</summary>
    private static readonly IReadOnlySet<string> ApprovableStatuses =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "OCR_COMPLETE", "IN_REVIEW" };

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

        // Publish accounting event — best-effort (failure is logged, not rethrown).
        await eventPublisher.PublishOcrCompletedAsync(doc, cancellationToken);

        return Result.Success();
    }
}
