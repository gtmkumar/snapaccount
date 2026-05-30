using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Admin.Queries.GetUserDocuments;

/// <summary>
/// Returns the most-recent N documents for a specific user, for the admin
/// per-user detail page. Cross-org admin view — SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.users.read")]
public record GetUserDocumentsQuery(Guid UserId, int Limit = 20)
    : IQuery<IReadOnlyList<UserDocumentDto>>;

public record UserDocumentDto(
    Guid Id,
    string FileName,
    string Status,
    string? VendorName,
    decimal? Amount,
    DateOnly? DocumentDate,
    DateTime UploadedAt);

public sealed class GetUserDocumentsQueryValidator : AbstractValidator<GetUserDocumentsQuery>
{
    public GetUserDocumentsQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Limit).InclusiveBetween(1, 100);
    }
}

public sealed class GetUserDocumentsQueryHandler(IDocumentDbContext db)
    : IQueryHandler<GetUserDocumentsQuery, IReadOnlyList<UserDocumentDto>>
{
    public async Task<Result<IReadOnlyList<UserDocumentDto>>> Handle(
        GetUserDocumentsQuery request, CancellationToken ct)
    {
        var rows = await db.Documents
            .Where(d => d.UserId == request.UserId && d.DeletedAt == null)
            .OrderByDescending(d => d.UploadedAt)
            .Take(request.Limit)
            .Select(d => new UserDocumentDto(
                d.Id, d.FileName, d.Status, d.VendorName, d.Amount,
                d.DocumentDate, d.UploadedAt))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserDocumentDto>>.Success(rows);
    }
}
