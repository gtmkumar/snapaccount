using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.AddDocumentTag;

/// <summary>
/// GAP-015: Adds a tag to a document.
/// Tags are free-form labels (max 64 chars) useful for vault organisation.
/// Duplicate tags on the same document are ignored (idempotent): re-adding the same
/// tag (case-insensitive) returns the existing row with HTTP 200 rather than creating
/// a duplicate. BUG-W6-004 fix: normalised comparison + <see cref="AddDocumentTagResponse.IsNewlyCreated"/>
/// flag so the endpoint can return 200 vs 201 correctly.
/// </summary>
[RequiresPermission("document.write")]
public record AddDocumentTagCommand(Guid DocumentId, string TagName) : ICommand<AddDocumentTagResponse>;

/// <summary>Response after adding a tag.</summary>
/// <param name="TagId">The tag's primary key.</param>
/// <param name="TagName">The stored tag name (original casing from first insert).</param>
/// <param name="DocumentId">The owning document's primary key.</param>
/// <param name="CreatedAt">UTC creation timestamp.</param>
/// <param name="IsNewlyCreated">
/// <c>true</c> if the tag was just inserted; <c>false</c> if an existing tag was returned
/// (idempotent path). Used by the endpoint to emit HTTP 201 vs 200 respectively.
/// </param>
public record AddDocumentTagResponse(Guid TagId, string TagName, Guid DocumentId, DateTime CreatedAt, bool IsNewlyCreated = true);

/// <summary>Validates the AddDocumentTagCommand.</summary>
public sealed class AddDocumentTagCommandValidator : AbstractValidator<AddDocumentTagCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public AddDocumentTagCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.TagName)
            .NotEmpty()
            .MaximumLength(64)
            .Matches("^[a-zA-Z0-9 _\\-]+$")
            .WithMessage("Tag name may only contain letters, digits, spaces, hyphens, and underscores.");
    }
}

/// <summary>Handles <see cref="AddDocumentTagCommand"/>.</summary>
public sealed class AddDocumentTagCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser) : ICommandHandler<AddDocumentTagCommand, AddDocumentTagResponse>
{
    /// <inheritdoc />
    public async Task<Result<AddDocumentTagResponse>> Handle(
        AddDocumentTagCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result<AddDocumentTagResponse>.Failure(
                Error.Unauthorized("Auth.Required", "Authentication required."));

        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result<AddDocumentTagResponse>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // IDOR guard
        if (doc.OrganizationId.HasValue &&
            doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result<AddDocumentTagResponse>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        // BUG-W6-004: Idempotency check uses a case-insensitive normalised comparison so that
        // "GST-Invoice" and "gst-invoice" are treated as the same tag.  EF Core translates
        // .ToLower() == normalised.ToLower() to SQL's lower() = lower(), giving DB-level
        // case-insensitivity without requiring a provider-specific extension (ILike).
        var normalised = request.TagName.Trim();
        var normalisedLower = normalised.ToLowerInvariant();
        var existingTag = await db.DocumentTags
            .FirstOrDefaultAsync(
                t => t.DocumentId == request.DocumentId
                    && t.TagName.ToLower() == normalisedLower
                    && t.DeletedAt == null,
                cancellationToken);

        if (existingTag is not null)
            return Result<AddDocumentTagResponse>.Success(
                new AddDocumentTagResponse(
                    TagId: existingTag.Id,
                    TagName: existingTag.TagName,
                    DocumentId: existingTag.DocumentId,
                    CreatedAt: existingTag.CreatedAt,
                    IsNewlyCreated: false));   // idempotent path — endpoint must return 200

        var tag = DocumentTag.Create(
            documentId: request.DocumentId,
            documentAt: doc.UploadedAt,
            tagName: normalised,
            createdByUserId: currentUser.UserId);

        db.DocumentTags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);

        return Result<AddDocumentTagResponse>.Success(
            new AddDocumentTagResponse(tag.Id, tag.TagName, tag.DocumentId, tag.CreatedAt, IsNewlyCreated: true));
    }
}
