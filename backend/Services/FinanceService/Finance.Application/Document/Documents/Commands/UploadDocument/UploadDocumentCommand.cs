using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Interfaces;
using DocumentService.Domain.Entities;
using DocumentService.Domain.Events;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
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
/// <param name="IdempotencyKey">
/// DG-DOC-08: Client-supplied UUID v4 (from <c>Idempotency-Key</c> header or form field).
/// When present, the handler checks for an existing document with the same
/// (org, idempotency_key) and returns it with HTTP 200 instead of creating a duplicate.
/// Null for web / legacy callers that do not send the header.
/// </param>
public record UploadDocumentCommand(
    Stream FileContent,
    string FileName,
    string MimeType,
    long FileSizeBytes,
    Guid? OrganizationId,
    Guid? CategoryId,
    string? IdempotencyKey = null) : ICommand<UploadDocumentResponse>;

/// <summary>
/// Response containing the document ID, storage path, and status.
/// <see cref="IsExisting"/> is true when the response was served from an existing row
/// due to idempotency-key deduplication (DG-DOC-08) — the HTTP endpoint returns 200
/// in this case instead of 201 Created.
/// </summary>
public record UploadDocumentResponse(
    Guid DocumentId,
    string StoragePath,
    string Status,
    bool IsExisting = false);

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
///
/// DG-DOC-08: When <see cref="UploadDocumentCommand.IdempotencyKey"/> is set,
/// checks for an existing document with the same (org, idempotency_key) before
/// uploading. On a match, returns the existing document with <see cref="UploadDocumentResponse.IsExisting"/>
/// = true (the endpoint responds with 200 instead of 201). This prevents duplicate
/// document rows from mobile retries after a lost success-ack.
/// </summary>
public sealed class UploadDocumentCommandHandler(
    IDocumentStorageService storageService,
    IDocumentRepository documentRepository,
    IDocumentDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<UploadDocumentCommand, UploadDocumentResponse>
{
    /// <inheritdoc />
    public async Task<Result<UploadDocumentResponse>> Handle(
        UploadDocumentCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = request.OrganizationId ?? currentUser.OrganizationId;

        // DG-DOC-08: Idempotency check — return existing document if key matches.
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey) && orgId.HasValue)
        {
            var existing = await db.Documents
                .Where(d =>
                    d.OrganizationId == orgId.Value
                    && d.IdempotencyKey == request.IdempotencyKey
                    && d.DeletedAt == null)
                .Select(d => new { d.Id, d.StoragePath, d.Status })
                .FirstOrDefaultAsync(cancellationToken);

            if (existing is not null)
            {
                return new UploadDocumentResponse(
                    existing.Id,
                    existing.StoragePath,
                    existing.Status,
                    IsExisting: true);
            }
        }

        // Upload to GCS first — fail fast if storage is unavailable.
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
            // Attribute the document to the uploader's active organization when the
            // caller doesn't specify one, so it surfaces in the org-scoped document list.
            OrganizationId = orgId,
            FileName = request.FileName,
            OriginalFileName = request.FileName,
            MimeType = request.MimeType,
            FileSizeBytes = request.FileSizeBytes,
            StoragePath = storagePath,
            CategoryId = request.CategoryId,
            // DG-DOC-08: Persist the idempotency key so future retries hit the check above.
            IdempotencyKey = string.IsNullOrWhiteSpace(request.IdempotencyKey)
                ? null
                : request.IdempotencyKey
        };

        document.AddDomainEvent(new DocumentUploadedEvent(
            document.Id, currentUser.UserId, request.OrganizationId, request.FileName, request.MimeType));

        document = await documentRepository.AddAsync(document, cancellationToken);

        return new UploadDocumentResponse(document.Id, storagePath, document.Status);
    }
}
