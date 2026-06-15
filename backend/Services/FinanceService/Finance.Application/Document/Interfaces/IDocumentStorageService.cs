using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Interfaces;

public interface IDocumentStorageService
{
    Task<Result<string>> UploadAsync(Stream content, string fileName, string contentType, Guid userId, CancellationToken ct = default);
    Task<Result<string>> GetSignedUrlAsync(string storagePath, CancellationToken ct = default);
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
}
