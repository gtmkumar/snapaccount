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
    Guid? UserId,   // Nullable: Guid.Empty/null for DPDP-erased documents (DG-SEC-03)
    string FileName,
    string MimeType,
    long? FileSizeBytes,
    string Status,
    string? StorageUrl,
    decimal? Amount,
    string? VendorName,
    DateOnly? DocumentDate,
    DateTime UploadedAt,
    decimal? OcrConfidence = null,
    string? OcrConfidenceLevel = null,
    IReadOnlyList<OcrFieldDto>? Fields = null);

/// <summary>A single extracted OCR field surfaced to clients (Document Detail screen).</summary>
public record OcrFieldDto(string Name, string? Value, decimal? Confidence);

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

        // Attach the latest OCR result's fields + confidence for the detail view.
        var ocr = await db.OcrResults
            .Where(r => r.DocumentId == request.DocumentId && r.DeletedAt == null)
            .OrderByDescending(r => r.ProcessedAt)
            .Select(r => new
            {
                r.ConfidenceScore,
                Fields = r.Fields
                    .Select(f => new OcrFieldDto(
                        f.FieldName,
                        f.IsOverridden ? f.OverriddenValue : f.FieldValue,
                        f.ConfidenceScore))
                    .ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (ocr is not null)
        {
            var level = ocr.ConfidenceScore switch
            {
                >= 0.8m => "GREEN",
                >= 0.5m => "YELLOW",
                _ => "RED"
            };
            doc = doc with
            {
                OcrConfidence = ocr.ConfidenceScore,
                OcrConfidenceLevel = level,
                Fields = ocr.Fields
            };
        }

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
