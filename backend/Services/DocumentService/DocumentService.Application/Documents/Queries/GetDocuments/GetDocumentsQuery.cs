using DocumentService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetDocuments;

[RequiresPermission("document.read")]
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

public sealed class GetDocumentsQueryHandler(IDocumentDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDocumentsQuery, PaginatedResult<DocumentListDto>>
{
    public async Task<Result<PaginatedResult<DocumentListDto>>> Handle(
        GetDocumentsQuery request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var orgId = currentUser.OrganizationId.Value;

        var query = db.Documents
            .Where(d => d.OrganizationId == orgId && d.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(request.Status))
            query = query.Where(d => d.Status == request.Status);

        if (request.CategoryId.HasValue)
            query = query.Where(d => d.CategoryId == request.CategoryId.Value);

        if (request.FromDate.HasValue)
            query = query.Where(d => d.DocumentDate >= request.FromDate.Value);

        if (request.ToDate.HasValue)
            query = query.Where(d => d.DocumentDate <= request.ToDate.Value);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(d => d.UploadedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DocumentListDto(
                d.Id, d.FileName, d.Status, d.VendorName, d.Amount, d.DocumentDate, d.UploadedAt))
            .ToListAsync(cancellationToken);

        return Result<PaginatedResult<DocumentListDto>>.Success(
            PaginatedResult<DocumentListDto>.Create(items, total, page, pageSize));
    }
}
