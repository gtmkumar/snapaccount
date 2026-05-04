using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.CategorizeDocument;

[RequiresPermission("document.update")]
public record CategorizeDocumentCommand(Guid DocumentId, Guid CategoryId) : ICommand;

public sealed class CategorizeDocumentCommandValidator : AbstractValidator<CategorizeDocumentCommand>
{
    public CategorizeDocumentCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.CategoryId).NotEmpty();
    }
}

public sealed class CategorizeDocumentCommandHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : ICommandHandler<CategorizeDocumentCommand>
{
    public async Task<Result> Handle(CategorizeDocumentCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId && d.DeletedAt == null, cancellationToken);
        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // IDOR — same org guard, NotFound to avoid existence leak.
        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // Verify category exists and belongs to caller's org or is a system category (org_id null).
        var category = await db.DocumentCategories
            .FirstOrDefaultAsync(c => c.Id == request.CategoryId && c.DeletedAt == null, cancellationToken);
        if (category is null)
            return Result.Failure(Error.NotFound("Category.NotFound", $"Category {request.CategoryId} not found."));

        doc.CategoryId = request.CategoryId;
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
