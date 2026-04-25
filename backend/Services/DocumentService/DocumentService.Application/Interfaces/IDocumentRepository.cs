using DocumentService.Domain.Entities;

namespace DocumentService.Application.Interfaces;

/// <summary>
/// Repository contract for <see cref="Document"/> aggregate root.
/// Defined in the Application layer so that command handlers depend on an abstraction,
/// not on EF Core infrastructure directly (Clean Architecture dependency rule).
/// Implementation lives in DocumentService.Infrastructure/Persistence/Repositories/.
/// </summary>
public interface IDocumentRepository
{
    /// <summary>Returns a document by its identifier, or null when not found.</summary>
    Task<Document?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Persists a new document and returns the saved entity.</summary>
    Task<Document> AddAsync(Document document, CancellationToken ct = default);

    /// <summary>Persists changes to an existing document.</summary>
    Task UpdateAsync(Document document, CancellationToken ct = default);
}
