using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Documents.Queries.ListDocuments;

/// <summary>
/// DTO for a single document record in the user's document list.
/// </summary>
/// <param name="Kind">Document kind: "PAN" | "AADHAAR" | "GSTIN" | "TAN".</param>
/// <param name="ReferenceNumber">
/// Masked display value.
/// Aadhaar: "XXXX-XXXX-1234" (only last 4 digits).
/// PAN/GSTIN/TAN: returned as stored (already format-valid; no sensitive data stored).
/// </param>
/// <param name="Status">Current status: "SAVED" | "PENDING" | "VERIFIED" | "FAILED".</param>
/// <param name="VerifiedAt">UTC timestamp of verification; null when not yet verified.</param>
public record DocumentDto(
    string Kind,
    string ReferenceNumber,
    string Status,
    DateTime? VerifiedAt);

/// <summary>
/// GET /auth/me/documents (RequireAuthorization)
/// Returns the current user's saved document records — one row per kind.
/// </summary>
public record ListDocumentsQuery : IQuery<IReadOnlyList<DocumentDto>>;

/// <summary>Handles <see cref="ListDocumentsQuery"/>.</summary>
public sealed class ListDocumentsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<ListDocumentsQuery, IReadOnlyList<DocumentDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DocumentDto>>> Handle(
        ListDocumentsQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var records = await db.KycVerifications
            .Where(k => k.UserId == userId && k.DeletedAt == null)
            .OrderBy(k => k.Kind)
            .Select(k => new DocumentDto(
                k.Kind,
                k.ReferenceNumber,
                k.Status,
                k.VerifiedAt))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<DocumentDto>>.Success(records);
    }
}
