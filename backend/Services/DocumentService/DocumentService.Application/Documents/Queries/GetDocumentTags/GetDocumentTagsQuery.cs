using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetDocumentTags;

/// <summary>
/// GAP-015: Returns all active (non-deleted) tags on a document.
/// Accessible to the document owner or any user in the same org.
/// </summary>
public record GetDocumentTagsQuery(Guid DocumentId) : IQuery<IReadOnlyList<DocumentTagDto>>;

/// <summary>Represents a single document tag.</summary>
public record DocumentTagDto(
    Guid TagId,
    string TagName,
    DateTime CreatedAt);

/// <summary>Handles <see cref="GetDocumentTagsQuery"/>.</summary>
public sealed class GetDocumentTagsQueryHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetDocumentTagsQuery, IReadOnlyList<DocumentTagDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DocumentTagDto>>> Handle(
        GetDocumentTagsQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result<IReadOnlyList<DocumentTagDto>>.Failure(
                Error.Unauthorized("Auth.Required", "Authentication required."));

        // IDOR guard: verify document belongs to caller's org
        var doc = await db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == request.DocumentId && d.DeletedAt == null,
                cancellationToken);

        if (doc is null)
            return Result<IReadOnlyList<DocumentTagDto>>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue &&
            doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result<IReadOnlyList<DocumentTagDto>>.Failure(
                Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found."));

        var tags = await db.DocumentTags
            .Where(t => t.DocumentId == request.DocumentId && t.DeletedAt == null)
            .OrderBy(t => t.TagName)
            .Select(t => new DocumentTagDto(t.Id, t.TagName, t.CreatedAt))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<DocumentTagDto>>.Success(tags);
    }
}
