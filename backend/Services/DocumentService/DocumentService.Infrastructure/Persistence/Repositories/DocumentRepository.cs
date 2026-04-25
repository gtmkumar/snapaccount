using DocumentService.Application.Interfaces;
using DocumentService.Domain.Entities;
using DocumentService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DocumentService.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IDocumentRepository"/>.
/// Commands mutate state exclusively through this repository;
/// read-side query handlers may access <see cref="DocumentDbContext"/> directly
/// for projection queries (JT CQRS pattern — documented in each query handler).
/// </summary>
public sealed class DocumentRepository(DocumentDbContext dbContext) : IDocumentRepository
{
    /// <inheritdoc />
    public Task<Document?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.Documents
            .FirstOrDefaultAsync(d => d.Id == id, ct);

    /// <inheritdoc />
    public async Task<Document> AddAsync(Document document, CancellationToken ct = default)
    {
        dbContext.Documents.Add(document);
        await dbContext.SaveChangesAsync(ct);
        return document;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(Document document, CancellationToken ct = default)
    {
        dbContext.Documents.Update(document);
        await dbContext.SaveChangesAsync(ct);
    }
}
