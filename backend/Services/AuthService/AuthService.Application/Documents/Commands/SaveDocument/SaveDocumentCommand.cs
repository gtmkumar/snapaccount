using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Domain.ValueObjects;

namespace AuthService.Application.Documents.Commands.SaveDocument;

/// <summary>
/// Response after saving or updating a document record.
/// </summary>
/// <param name="Kind">Document kind that was saved.</param>
/// <param name="ReferenceNumber">Stored reference (Aadhaar masked).</param>
/// <param name="Status">
/// "SAVED" when the org has GovernmentVerificationEnabled=false.
/// "PENDING" when GovernmentVerificationEnabled=true (awaiting OTP verification).
/// </param>
public record SaveDocumentResponse(string Kind, string ReferenceNumber, string Status);

/// <summary>
/// POST /auth/me/documents/{kind} { number, holderName? } (RequireAuthorization)
///
/// Validates the document number format for the given kind.
/// Behaviour branches on the organization's <c>GovernmentVerificationEnabled</c> flag:
/// <list type="bullet">
///   <item>Flag OFF → upsert <c>auth.kyc_verification</c> with status SAVED (no OTP required).</item>
///   <item>Flag ON  → upsert with status PENDING (OTP send + confirm required to reach VERIFIED).</item>
/// </list>
///
/// Soft-deletes the existing record for this user+kind before inserting a new one (upsert semantics
/// that respect the partial unique index <c>ux_kyc_verification_user_kind</c>).
/// </summary>
public record SaveDocumentCommand(
    string Kind,
    string Number,
    string? HolderName = null) : ICommand<SaveDocumentResponse>;

/// <summary>FluentValidation validator — validates the number format per kind.</summary>
public sealed class SaveDocumentCommandValidator : AbstractValidator<SaveDocumentCommand>
{
    public SaveDocumentCommandValidator()
    {
        RuleFor(x => x.Kind)
            .Must(k => KycKind.Parse(k) is not null)
            .WithMessage("Kind must be one of: pan, aadhaar, gstin, tan.");

        // Cross-field: validate number format based on kind.
        // We use a cascade approach — first check kind, then validate number.
        When(x => KycKind.Parse(x.Kind) is not null, () =>
        {
            RuleFor(x => x)
                .Must(x => ValidateNumberForKind(x.Kind, x.Number))
                .WithMessage(x => FormatErrorMessage(x.Kind));
        });

        RuleFor(x => x.Number).NotEmpty();
    }

    private static bool ValidateNumberForKind(string kind, string number) =>
        KycKind.Parse(kind) switch
        {
            KycKind.Pan     => PanNumber.Create(number ?? string.Empty).IsSuccess,
            KycKind.Aadhaar => System.Text.RegularExpressions.Regex.IsMatch(number ?? string.Empty, @"^\d{12}$"),
            KycKind.Gstin   => GstinNumber.Create(number ?? string.Empty).IsSuccess,
            KycKind.Tan     => TanNumber.Create(number ?? string.Empty).IsSuccess,
            _               => false
        };

    private static string FormatErrorMessage(string kind) =>
        KycKind.Parse(kind) switch
        {
            KycKind.Pan     => "PAN must be in format XXXXX9999X.",
            KycKind.Aadhaar => "Aadhaar must be exactly 12 digits.",
            KycKind.Gstin   => "GSTIN must be a valid 15-character GST identification number.",
            KycKind.Tan     => "TAN must be in format AAAA99999A.",
            _               => "Invalid document number format."
        };
}

/// <summary>Handles <see cref="SaveDocumentCommand"/>.</summary>
public sealed class SaveDocumentCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<SaveDocumentCommand, SaveDocumentResponse>
{
    /// <inheritdoc />
    public async Task<Result<SaveDocumentResponse>> Handle(
        SaveDocumentCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var kind = KycKind.Parse(request.Kind)!;
        var number = NormalizeNumber(kind, request.Number);

        // Validate format using value objects (belt-and-suspenders after FluentValidation)
        var validationError = ValidateFormat(kind, request.Number);
        if (validationError is not null)
            return validationError;

        // Resolve the org's GovernmentVerificationEnabled flag for this user
        var govEnabled = await ResolveGovVerificationAsync(userId, cancellationToken);
        var targetStatus = govEnabled ? KycStatus.Pending : KycStatus.Saved;

        // Upsert: soft-delete any existing record for this user+kind, then insert new
        var existing = await db.KycVerifications
            .FirstOrDefaultAsync(
                k => k.UserId == userId && k.Kind == kind && k.DeletedAt == null,
                cancellationToken);

        if (existing is not null)
        {
            existing.DeletedAt = DateTime.UtcNow;
        }

        var record = new KycVerification
        {
            UserId          = userId,
            Kind            = kind,
            ReferenceNumber = number,
            Status          = targetStatus,
            Provider        = "pending"
        };
        db.KycVerifications.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        return new SaveDocumentResponse(kind, number, targetStatus);
    }

    private static string NormalizeNumber(string kind, string raw) =>
        kind == KycKind.Aadhaar
            ? MaskAadhaar(raw)
            : raw.Trim().ToUpperInvariant();

    private static string MaskAadhaar(string aadhaar) =>
        $"XXXX-XXXX-{aadhaar[^4..]}";

    private static Error? ValidateFormat(string kind, string number) =>
        kind switch
        {
            KycKind.Pan when PanNumber.Create(number).IsFailure =>
                Error.Validation("Document.InvalidPan", "PAN must be in format XXXXX9999X."),
            KycKind.Aadhaar when !System.Text.RegularExpressions.Regex.IsMatch(number, @"^\d{12}$") =>
                Error.Validation("Document.InvalidAadhaar", "Aadhaar must be exactly 12 digits."),
            KycKind.Gstin when GstinNumber.Create(number).IsFailure =>
                Error.Validation("Document.InvalidGstin", "GSTIN must be a valid 15-character GST identification number."),
            KycKind.Tan when TanNumber.Create(number).IsFailure =>
                Error.Validation("Document.InvalidTan", "TAN must be in format AAAA99999A."),
            _ => null
        };

    private async Task<bool> ResolveGovVerificationAsync(Guid userId, CancellationToken ct)
    {
        return await db.OrganizationMembers
            .Where(m => m.UserId == userId && m.IsActive && m.DeletedAt == null)
            .Join(db.Organizations.Where(o => o.IsActive && o.DeletedAt == null),
                m => m.OrganizationId,
                o => o.Id,
                (m, o) => o.GovernmentVerificationEnabled)
            .FirstOrDefaultAsync(ct);
    }
}
