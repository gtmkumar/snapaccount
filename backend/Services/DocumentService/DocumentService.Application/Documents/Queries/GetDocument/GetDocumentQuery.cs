using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetDocument;

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

public sealed class GetDocumentQueryHandler : IQueryHandler<GetDocumentQuery, DocumentDto>
{
    public Task<Result<DocumentDto>> Handle(GetDocumentQuery request, CancellationToken cancellationToken)
        => throw new NotImplementedException("TODO: Fetch document, generate signed URL, return DTO.");
}
