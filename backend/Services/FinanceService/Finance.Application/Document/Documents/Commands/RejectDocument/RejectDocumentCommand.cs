using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.RejectDocument;

/// <summary>
/// Rejects a document and records the operator's rejection reason.
/// Valid from any non-terminal status (ARCHIVED and APPROVED are terminal).
/// </summary>
[RequiresPermission("document.review")]
public record RejectDocumentCommand(Guid DocumentId, string Reason) : ICommand;

/// <summary>Validates <see cref="RejectDocumentCommand"/>.</summary>
public sealed class RejectDocumentCommandValidator : AbstractValidator<RejectDocumentCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public RejectDocumentCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("Rejection reason is required.")
            .MaximumLength(2000).WithMessage("Rejection reason cannot exceed 2000 characters.");
    }
}

/// <summary>
/// Handles <see cref="RejectDocumentCommand"/>.
/// Org-scopes the lookup, rejects only non-terminal documents, and pushes a
/// SignalR DocumentStatusChanged event (DG-DOC-07) to the document owner's client.
/// </summary>
public sealed class RejectDocumentCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser,
    IDocumentHubNotifier? hubNotifier = null) : ICommandHandler<RejectDocumentCommand>
{
    /// <summary>Terminal statuses that may not be rejected.</summary>
    private static readonly IReadOnlySet<string> TerminalStatuses =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "APPROVED", "ARCHIVED" };

    /// <inheritdoc />
    public async Task<Result> Handle(RejectDocumentCommand request, CancellationToken cancellationToken)
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

        // SEC-IDOR: org-scope guard.
        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // Idempotency: already rejected.
        if (doc.Status == "REJECTED")
            return Result.Success();

        // State guard: cannot reject terminal documents.
        if (TerminalStatuses.Contains(doc.Status))
            return Result.Failure(Error.Validation("Document.InvalidTransition",
                $"Document in terminal status '{doc.Status}' cannot be rejected."));

        doc.Reject(request.Reason);
        await db.SaveChangesAsync(cancellationToken);

        // DG-DOC-07: Push real-time status change to the document owner's mobile client.
        if (hubNotifier is not null && doc.UserId.HasValue)
        {
            await hubNotifier.NotifyStatusChangedAsync(doc.Id, doc.UserId.Value, doc.Status, cancellationToken);
        }

        return Result.Success();
    }
}
