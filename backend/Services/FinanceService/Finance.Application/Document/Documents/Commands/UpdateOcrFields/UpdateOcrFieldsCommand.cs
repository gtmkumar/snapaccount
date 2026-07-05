using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.UpdateOcrFields;

/// <summary>
/// A single field-override payload from the admin Save-Draft request.
/// </summary>
/// <param name="FieldId">ID of the <c>OcrField</c> row to override.</param>
/// <param name="NewValue">The corrected value entered by the reviewer.</param>
public record OcrFieldOverrideItem(Guid FieldId, string NewValue);

/// <summary>
/// Persists manual OCR field overrides for the admin Document Review "Save Draft" flow (DG-DOC-03).
/// Calls <see cref="DocumentService.Domain.Entities.OcrField.Override"/> for each edited field
/// so that subsequent <c>GET /documents/{id}</c> responses return the corrected values with
/// <c>IsOverridden = true</c>.
/// IDOR guard: document must belong to the caller's organisation.
/// SEC-012: Requires <c>document.review</c> permission (same gate as Approve/Reject).
/// </summary>
/// <param name="DocumentId">The document whose OCR fields are being overridden.</param>
/// <param name="Overrides">List of field overrides to apply.</param>
[RequiresPermission("document.review")]
public record UpdateOcrFieldsCommand(
    Guid DocumentId,
    IReadOnlyList<OcrFieldOverrideItem> Overrides) : ICommand;

/// <summary>Validates the <see cref="UpdateOcrFieldsCommand"/>.</summary>
public sealed class UpdateOcrFieldsCommandValidator : AbstractValidator<UpdateOcrFieldsCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public UpdateOcrFieldsCommandValidator()
    {
        RuleFor(x => x.DocumentId).NotEmpty();
        RuleFor(x => x.Overrides).NotNull().NotEmpty()
            .WithMessage("At least one field override is required.");
        RuleForEach(x => x.Overrides).ChildRules(o =>
        {
            o.RuleFor(f => f.FieldId).NotEmpty();
            o.RuleFor(f => f.NewValue).NotNull().MaximumLength(2000);
        });
    }
}

/// <summary>
/// Handles <see cref="UpdateOcrFieldsCommand"/>.
/// Loads the latest OCR result for the document, applies <see cref="DocumentService.Domain.Entities.OcrField.Override"/>
/// for each requested field, and persists. Fields not present in the request are left unchanged.
/// Returns a count of fields actually updated.
/// </summary>
public sealed class UpdateOcrFieldsCommandHandler(
    IDocumentDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<UpdateOcrFieldsCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(UpdateOcrFieldsCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Result.Failure(Error.Unauthorized("Auth.Required", "Authentication required."));

        // Verify the document exists and belongs to the caller's org (IDOR guard).
        var doc = await db.Documents
            .Where(d => d.Id == request.DocumentId && d.DeletedAt == null)
            .Select(d => new { d.Id, d.OrganizationId })
            .FirstOrDefaultAsync(cancellationToken);

        if (doc is null)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        if (doc.OrganizationId.HasValue
            && doc.OrganizationId.Value != currentUser.OrganizationId.Value)
            return Result.Failure(Error.NotFound("Document.NotFound",
                $"Document {request.DocumentId} not found."));

        // Collect the field IDs being overridden.
        var requestedFieldIds = request.Overrides.Select(o => o.FieldId).ToHashSet();

        // Load only the OcrField rows we need to mutate — from the document's OCR results.
        // We join via OcrResult to ensure we only touch fields that belong to this document.
        var ocrResultIds = await db.OcrResults
            .Where(r => r.DocumentId == request.DocumentId && r.DeletedAt == null)
            .Select(r => r.Id)
            .ToListAsync(cancellationToken);

        if (ocrResultIds.Count == 0)
            return Result.Failure(Error.NotFound("Document.OcrNotFound",
                $"No OCR results found for document {request.DocumentId}. Run OCR first."));

        var fields = await db.OcrFields
            .Where(f => ocrResultIds.Contains(f.OcrResultId)
                        && requestedFieldIds.Contains(f.Id)
                        && f.DeletedAt == null)
            .ToListAsync(cancellationToken);

        if (fields.Count == 0)
            return Result.Failure(Error.NotFound("Document.OcrFieldNotFound",
                "None of the requested OCR field IDs were found for this document."));

        // Build a lookup for fast per-field access.
        var overridesByFieldId = request.Overrides.ToDictionary(o => o.FieldId, o => o.NewValue);

        foreach (var field in fields)
        {
            if (overridesByFieldId.TryGetValue(field.Id, out var newValue))
                field.Override(newValue, currentUser.UserId);
        }

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
