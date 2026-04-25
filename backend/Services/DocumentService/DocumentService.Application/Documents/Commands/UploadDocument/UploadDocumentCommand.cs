using DocumentService.Application.Interfaces;
using DocumentService.Domain.Entities;
using DocumentService.Domain.Events;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.UploadDocument;

/// <summary>Uploads a document file to GCS and creates a <see cref="Document"/> aggregate.</summary>
/// <param name="FileContent">Raw file stream from the multipart upload.</param>
/// <param name="FileName">Original file name (validated, sanitised before storage).</param>
/// <param name="MimeType">MIME type of the file.</param>
/// <param name="FileSizeBytes">File size — validated against 5MB limit before reaching AI services.</param>
/// <param name="OrganizationId">Optional organization context for the document.</param>
/// <param name="CategoryId">Optional pre-assigned category.</param>
public record UploadDocumentCommand(
    Stream FileContent,
    string FileName,
    string MimeType,
    long FileSizeBytes,
    Guid? OrganizationId,
    Guid? CategoryId) : ICommand<UploadDocumentResponse>;

/// <summary>Response containing the new document ID and its GCS storage path.</summary>
public record UploadDocumentResponse(Guid DocumentId, string StoragePath, string Status);

/// <summary>
/// FluentValidation validator for <see cref="UploadDocumentCommand"/>.
/// Enforces allowed MIME types and 5MB max file size to prevent abuse of AI/OCR pipelines.
/// </summary>
public sealed class UploadDocumentCommandValidator : AbstractValidator<UploadDocumentCommand>
{
    private static readonly string[] AllowedMimeTypes =
        ["image/jpeg", "image/png", "application/pdf", "image/heic", "image/heif"];

    private const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5MB

    public UploadDocumentCommandValidator()
    {
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(500);
        RuleFor(x => x.MimeType)
            .Must(m => AllowedMimeTypes.Contains(m))
            .WithMessage("Allowed file types: JPG, PNG, PDF, HEIC.");
        RuleFor(x => x.FileSizeBytes)
            .LessThanOrEqualTo(MaxFileSizeBytes)
            .WithMessage("File size cannot exceed 5MB.");
    }
}

/// <summary>
/// Uploads the file to GCS via <see cref="IDocumentStorageService"/>, creates
/// the <see cref="Document"/> aggregate, optionally assigns a category, and persists.
/// </summary>
public sealed class UploadDocumentCommandHandler(
    IDocumentStorageService storageService,
    IDocumentRepository documentRepository,
    ICurrentUser currentUser)
    : ICommandHandler<UploadDocumentCommand, UploadDocumentResponse>
{
    /// <inheritdoc />
    public async Task<Result<UploadDocumentResponse>> Handle(
        UploadDocumentCommand request,
        CancellationToken cancellationToken)
    {
        // Upload to GCS first — fail fast if storage is unavailable
        var uploadResult = await storageService.UploadAsync(
            request.FileContent,
            request.FileName,
            request.MimeType,
            currentUser.UserId,
            cancellationToken);

        if (uploadResult.IsFailure)
            return uploadResult.Error;

        var storagePath = uploadResult.Value;

        var document = new Document
        {
            UserId = currentUser.UserId,
            OrganizationId = request.OrganizationId,
            FileName = request.FileName,
            OriginalFileName = request.FileName,
            MimeType = request.MimeType,
            FileSizeBytes = request.FileSizeBytes,
            StoragePath = storagePath,
            CategoryId = request.CategoryId
        };

        document.AddDomainEvent(new DocumentUploadedEvent(
            document.Id, currentUser.UserId, request.OrganizationId, request.FileName, request.MimeType));

        document = await documentRepository.AddAsync(document, cancellationToken);

        return new UploadDocumentResponse(document.Id, storagePath, document.Status);
    }
}
