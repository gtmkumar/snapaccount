using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetDocument;

[RequiresPermission("document.read")]
public record GetDocumentQuery(Guid DocumentId) : IQuery<DocumentDto>;

public record DocumentDto(
    Guid Id,
    Guid UserId,
    string FileName,
    string MimeType,
    long? FileSizeBytes,
    string Status,
    string? StorageUrl,
    decimal? Amount,
    string? VendorName,
    DateOnly? DocumentDate,
    DateTime UploadedAt);

public sealed class GetDocumentQueryHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDocumentQuery, DocumentDto>
{
    public async Task<Result<DocumentDto>> Handle(GetDocumentQuery request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var doc = await db.Documents
            .Where(d => d.Id == request.DocumentId && d.DeletedAt == null)
            .Select(d => new DocumentDto(
                d.Id, d.UserId, d.FileName, d.MimeType, d.FileSizeBytes,
                d.Status, d.StorageUrl, d.Amount, d.VendorName, d.DocumentDate, d.UploadedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (doc is null)
            return Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found.");

        // SEC-IDOR: verify the document belongs to the caller's organisation,
        // re-querying ownership separately to keep the projection lean.
        var ownerOrg = await db.Documents
            .Where(d => d.Id == request.DocumentId)
            .Select(d => d.OrganizationId)
            .FirstAsync(cancellationToken);

        if (ownerOrg.HasValue && currentUser.OrganizationId.HasValue
            && ownerOrg.Value != currentUser.OrganizationId.Value)
            return Error.NotFound("Document.NotFound", $"Document {request.DocumentId} not found.");

        return doc;
    }
}
