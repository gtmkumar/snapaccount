using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetDocuments;

public record GetDocumentsQuery(
    int Page = 1,
    int PageSize = 20,
    string? Status = null,
    Guid? CategoryId = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null) : IQuery<PaginatedResult<DocumentListDto>>;

public record DocumentListDto(
    Guid Id, string FileName, string Status, string? VendorName,
    decimal? Amount, DateOnly? DocumentDate, DateTime UploadedAt);

public sealed class GetDocumentsQueryHandler : IQueryHandler<GetDocumentsQuery, PaginatedResult<DocumentListDto>>
{
    public Task<Result<PaginatedResult<DocumentListDto>>> Handle(GetDocumentsQuery request, CancellationToken cancellationToken)
        => throw new NotImplementedException("TODO: Query documents with filters and pagination.");
}
