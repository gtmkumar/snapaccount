using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.ArchiveDocument;

/// <summary>
/// Marks a document as archived. The actual GCS coldline-class transition is
/// handled out-of-band by a bucket lifecycle rule (cheaper + bullet-proof
/// than per-object class changes from app code); this command only updates
/// the document's status and ArchivedAt timestamp so the UI hides it from
/// the active inbox.
/// </summary>
[RequiresPermission("document.archive")]
public record ArchiveDocumentCommand(Guid DocumentId) : ICommand;

public sealed class ArchiveDocumentCommandValidator : AbstractValidator<ArchiveDocumentCommand>
{
    public ArchiveDocumentCommandValidator() => RuleFor(x => x.DocumentId).NotEmpty();
}

public sealed class ArchiveDocumentCommandHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : ICommandHandler<ArchiveDocumentCommand>
{
    public async Task<Result> Handle(ArchiveDocumentCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId && d.DeletedAt == null, cancellationToken);
        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.Status == "ARCHIVED")
            return Result.Success(); // idempotent

        doc.Archive();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
