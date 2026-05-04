using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.ShareDocument;

[RequiresPermission("document.share")]
public record ShareDocumentCommand(
    Guid DocumentId,
    string ShareType,
    Guid? SharedWith,
    string? ExternalEmail,
    DateTime? ExpiresAt = null) : ICommand<ShareDocumentResponse>;

public record ShareDocumentResponse(Guid ShareId, string? AccessToken);

public sealed class ShareDocumentCommandValidator : AbstractValidator<ShareDocumentCommand>
{
    private static readonly string[] ValidTypes = ["CA", "BANK", "USER", "EXTERNAL_LINK"];

    public ShareDocumentCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.ShareType).NotEmpty().Must(t => ValidTypes.Contains(t))
            .WithMessage($"ShareType must be one of: {string.Join(", ", ValidTypes)}");
        RuleFor(x => x.ExternalEmail)
            .EmailAddress().When(x => !string.IsNullOrEmpty(x.ExternalEmail));
        RuleFor(x => x)
            .Must(x => x.ShareType == "EXTERNAL_LINK" || x.SharedWith.HasValue || !string.IsNullOrEmpty(x.ExternalEmail))
            .WithMessage("Internal shares require SharedWith user id; external email shares require ExternalEmail.");
    }
}

public sealed class ShareDocumentCommandHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : ICommandHandler<ShareDocumentCommand, ShareDocumentResponse>
{
    public async Task<Result<ShareDocumentResponse>> Handle(
        ShareDocumentCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var doc = await db.Documents
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId && d.DeletedAt == null, cancellationToken);
        if (doc is null)
            return Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found.");

        if (doc.OrganizationId.HasValue && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found.");

        var share = DocumentShare.Create(
            documentId: doc.Id,
            documentAt: doc.UploadedAt,
            sharedBy: currentUser.UserId,
            shareType: request.ShareType,
            sharedWith: request.SharedWith,
            externalEmail: request.ExternalEmail,
            expiresAt: request.ExpiresAt);

        db.DocumentShares.Add(share);
        await db.SaveChangesAsync(cancellationToken);

        return new ShareDocumentResponse(share.Id, share.AccessToken);
    }
}
