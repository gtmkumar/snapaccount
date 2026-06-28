using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.RequestClarification;

/// <summary>
/// Records a clarification request from an operator to the document owner.
/// The document status is not changed — it remains in its current state for re-upload
/// or correction by the owner.
///
/// TODO: Raise a notification event DOC_CLARIFICATION_REQUESTED (not yet in the
/// 26-event catalog) — proposed event code: "DOC_CLARIFICATION_REQUESTED",
/// channels: Push,InApp. Add to NotificationEventCatalog when the notification team
/// creates the corresponding template.
/// </summary>
[RequiresPermission("document.review")]
public record RequestClarificationCommand(Guid DocumentId, string Message) : ICommand;

/// <summary>Validates <see cref="RequestClarificationCommand"/>.</summary>
public sealed class RequestClarificationCommandValidator : AbstractValidator<RequestClarificationCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public RequestClarificationCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.Message)
            .NotEmpty().WithMessage("Clarification message is required.")
            .MaximumLength(2000).WithMessage("Clarification message cannot exceed 2000 characters.");
    }
}

/// <summary>
/// Handles <see cref="RequestClarificationCommand"/>.
/// Persists the clarification request as an audit record and fires a DOC_CLARIFICATION_REQUESTED
/// notification to the document owner via the event publisher.
/// </summary>
public sealed class RequestClarificationCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser,
    ILogger<RequestClarificationCommandHandler> logger,
    IDocumentEventPublisher? eventPublisher = null) : ICommandHandler<RequestClarificationCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RequestClarificationCommand request, CancellationToken cancellationToken)
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

        // The document status does not change — the operator is requesting more info
        // from the owner without rejecting or approving.
        doc.RequestClarification();

        // UpdatedAt will be stamped by AuditableEntityInterceptor.
        await db.SaveChangesAsync(cancellationToken);

        // DG-NOTIF-01: Publish DOC_CLARIFICATION_REQUESTED notification event.
        // eventPublisher is optional — null in tests / local dev without GCP.
        if (eventPublisher is not null && doc.UserId.HasValue)
        {
            try
            {
                await eventPublisher.PublishClarificationRequestedAsync(doc, request.Message, cancellationToken);
            }
            catch (Exception ex)
            {
                // Fire-and-forget: clarification already saved; notification is best-effort.
                logger.LogWarning(ex,
                    "RequestClarificationCommandHandler: notification publish failed for document {DocumentId}",
                    doc.Id);
            }
        }

        return Result.Success();
    }
}
