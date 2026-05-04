using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.RequestOcr;

/// <summary>
/// Enqueues an OCR job for a document. Idempotent — repeat calls on a doc that
/// is already in OCR_IN_PROGRESS return success without re-enqueuing.
/// </summary>
[RequiresPermission("document.update")]
public record RequestOcrCommand(Guid DocumentId) : ICommand;

public sealed class RequestOcrCommandValidator : AbstractValidator<RequestOcrCommand>
{
    public RequestOcrCommandValidator() => RuleFor(x => x.DocumentId).NotEmpty();
}

public sealed class RequestOcrCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser,
    IOcrJobEnqueuer ocrEnqueuer) : ICommandHandler<RequestOcrCommand>
{
    public async Task<Result> Handle(RequestOcrCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId && d.DeletedAt == null, cancellationToken);
        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // Idempotent: already in flight or done.
        if (doc.Status is "OCR_IN_PROGRESS" or "OCR_COMPLETE" or "PROCESSED")
            return Result.Success();

        doc.StartOcr();
        await db.SaveChangesAsync(cancellationToken);

        // Fire-and-track: enqueue runs out of band; failure of enqueue is logged but
        // does not roll back the status change — the OCR worker has its own retry.
        await ocrEnqueuer.EnqueueAsync(doc.Id, cancellationToken);

        return Result.Success();
    }
}
