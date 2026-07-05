using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.DeleteDocument;

/// <summary>
/// Soft-deletes a document owned by the authenticated user's organisation.
/// Sets <c>DeletedAt</c> to the current UTC time — the document is never physically removed
/// from GCS at this point (GCS object lifecycle or a DPDP-erasure job handles that).
/// IDOR guard: the document must belong to the caller's organisation.
/// SEC-012: Requires <c>document.delete</c> permission.
/// </summary>
/// <param name="DocumentId">The ID of the document to delete.</param>
[RequiresPermission("document.delete")]
public record DeleteDocumentCommand(Guid DocumentId) : ICommand;

/// <summary>Validates the <see cref="DeleteDocumentCommand"/>.</summary>
public sealed class DeleteDocumentCommandValidator : AbstractValidator<DeleteDocumentCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public DeleteDocumentCommandValidator() => RuleFor(x => x.DocumentId).NotEmpty();
}

/// <summary>
/// Handles <see cref="DeleteDocumentCommand"/>.
/// Applies a soft-delete by setting <c>DeletedAt</c> on the document row.
/// The global EF query filter (DeletedAt IS NULL) ensures the document
/// becomes invisible to all subsequent queries immediately.
/// </summary>
public sealed class DeleteDocumentCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<DeleteDocumentCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(DeleteDocumentCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        // Load including soft-deleted check — only non-deleted docs can be deleted.
        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // SEC-IDOR: document must belong to the caller's organisation.
        if (doc.OrganizationId.HasValue
            && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // Ownership guard: users can only delete their own documents unless they are
        // an admin. Admins have document.delete via their role; regular users whose
        // UserId does not match get a 403 via PermissionBehavior before reaching here.
        // Belt-and-suspenders: also guard that the doc's userId matches.
        if (doc.UserId.HasValue && doc.UserId.Value != currentUser.UserId
            && !currentUser.HasPermission("document.admin"))
        {
            return Result.Failure(Error.Forbidden("Document.Forbidden",
                "You can only delete your own documents."));
        }

        // Soft-delete: set DeletedAt — EF global filter (DeletedAt IS NULL) will hide
        // this document from all subsequent queries immediately.
        doc.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
