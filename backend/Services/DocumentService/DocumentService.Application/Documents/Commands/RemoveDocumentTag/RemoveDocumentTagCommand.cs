using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.RemoveDocumentTag;

/// <summary>
/// GAP-015: Removes a tag from a document by tag ID (soft-delete).
/// Idempotent — already-deleted tag returns success.
/// </summary>
[RequiresPermission("document.write")]
public record RemoveDocumentTagCommand(Guid DocumentId, Guid TagId) : ICommand;

/// <summary>Validates the RemoveDocumentTagCommand.</summary>
public sealed class RemoveDocumentTagCommandValidator : AbstractValidator<RemoveDocumentTagCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public RemoveDocumentTagCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.TagId).NotEmpty();
    }
}

/// <summary>Handles <see cref="RemoveDocumentTagCommand"/>.</summary>
public sealed class RemoveDocumentTagCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RemoveDocumentTagCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        RemoveDocumentTagCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        // Verify document ownership (IDOR guard)
        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue &&
            doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        var tag = await db.DocumentTags
            .FirstOrDefaultAsync(
                t => t.Id == request.TagId
                    && t.DocumentId == request.DocumentId,
                cancellationToken);

        if (tag is null || tag.DeletedAt is not null)
            return Result.Success(); // idempotent

        tag.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
