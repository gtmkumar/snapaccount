using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Domain.ValueObjects;

namespace AuthService.Application.Kyc.Commands.VerifyGstin;

/// <summary>
/// Response returned to the caller after GSTIN verification.
/// Business-profile fields are populated on success and can be used by the
/// BusinessProfileWizardScreen to auto-fill businessName + address (DG-AUTH-04).
/// </summary>
/// <param name="Status">Verification status: "VERIFIED" or "FAILED".</param>
/// <param name="VerifiedAt">UTC timestamp when status is VERIFIED; null on failure.</param>
/// <param name="LegalName">Legal (registered) business name from the GSTN registry.</param>
/// <param name="TradeName">Trade name (if different from legal name) from the GSTN registry.</param>
/// <param name="PrincipalPlaceOfBusiness">Registered principal place of business address.</param>
public record VerifyGstinResponse(
    string Status,
    DateTime? VerifiedAt,
    string? LegalName = null,
    string? TradeName = null,
    string? PrincipalPlaceOfBusiness = null);

/// <summary>
/// POST /auth/gstin/verify { gstin } (RequireAuthorization)
/// DG-AUTH-04: Validates the GSTIN format (15-character format), calls the KYC provider,
/// persists a kyc_verification record of kind=GSTIN, and returns business-profile fields
/// for onboarding auto-fill (legalName / tradeName / principalPlaceOfBusiness).
/// </summary>
/// <param name="Gstin">GSTIN in the 15-character format (e.g. 22AAAAA0000A1Z5).</param>
public record VerifyGstinCommand(string Gstin) : ICommand<VerifyGstinResponse>;

/// <summary>Validates the GSTIN format: 15 characters, starts with a 2-digit state code.</summary>
public sealed class VerifyGstinCommandValidator : AbstractValidator<VerifyGstinCommand>
{
    public VerifyGstinCommandValidator()
    {
        RuleFor(x => x.Gstin)
            .NotEmpty()
            .Length(15)
            .Must(gstin => GstinNumber.Create(gstin ?? string.Empty).IsSuccess)
            .WithMessage("GSTIN must be a valid 15-character format (e.g. 22AAAAA0000A1Z5).");
    }
}

/// <summary>
/// Handles GSTIN KYC verification.
/// Calls the configured KYC provider (<c>IKycProvider.VerifyGstinAsync</c>),
/// persists the outcome in <c>auth.kyc_verification</c> (upsert by user + kind),
/// and returns business-profile fields for onboarding auto-fill.
/// </summary>
public sealed class VerifyGstinCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IKycProvider kycProvider)
    : ICommandHandler<VerifyGstinCommand, VerifyGstinResponse>
{
    /// <inheritdoc />
    public async Task<Result<VerifyGstinResponse>> Handle(
        VerifyGstinCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Validate via the value object (double-check after validator in case pipeline is bypassed).
        var gstinResult = GstinNumber.Create(request.Gstin);
        if (gstinResult.IsFailure)
            return gstinResult.Error;

        var gstin = gstinResult.Value.Value.ToUpperInvariant();

        // Call the KYC provider to verify and retrieve business details.
        var kycResult = await kycProvider.VerifyGstinAsync(gstin, cancellationToken);

        var verifiedAt = kycResult.Verified ? DateTime.UtcNow : (DateTime?)null;
        var status     = kycResult.Verified ? KycStatus.Verified : KycStatus.Failed;

        // Upsert kyc_verification record: one active record per user per kind (GSTIN).
        var existing = await db.KycVerifications
            .FirstOrDefaultAsync(
                k => k.UserId == userId && k.Kind == KycKind.Gstin && k.DeletedAt == null,
                cancellationToken);

        if (existing is not null)
        {
            existing.ReferenceNumber = gstin;
            existing.Status          = status;
            existing.ProviderRef     = kycResult.ProviderRef;
            existing.VerifiedAt      = verifiedAt;
        }
        else
        {
            db.KycVerifications.Add(new KycVerification
            {
                UserId          = userId,
                Kind            = KycKind.Gstin,
                ReferenceNumber = gstin,
                Status          = status,
                Provider        = "kyc",
                ProviderRef     = kycResult.ProviderRef,
                VerifiedAt      = verifiedAt,
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        return new VerifyGstinResponse(
            Status:                    status,
            VerifiedAt:                verifiedAt,
            LegalName:                 kycResult.LegalName,
            TradeName:                 kycResult.TradeName,
            PrincipalPlaceOfBusiness:  kycResult.PrincipalPlaceOfBusiness);
    }
}
