using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using LoanService.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RecordConsent;

/// <summary>
/// Records a user's digital consent for a loan application.
/// P6-HANDOFF-26: HMAC-SHA256 signature computed server-side using Secret Manager key.
/// Signature payload: {user_id}|{app_id}|{consent_text_version}|{signed_at_iso8601}
///
/// GAP-040 / P6-HANDOFF-25: <see cref="ConsentLocale"/> records the exact locale of the
/// consent text served to the user via GET /loans/consents/catalog, so the DPDP audit trail
/// ties back to the precise language version the user reviewed (RBI + DPDP legal artifact).
///
/// GAP-021 / RBI DL Guidelines: <see cref="KfsId"/> is REQUIRED. The handler validates that
/// the referenced KFS was previously served for this application and marks it acknowledged.
/// Consent submissions without a valid KFS reference are rejected.
/// </summary>
[RequiresPermission("loan.application.consent")]
public record RecordConsentCommand(
    Guid ApplicationId,
    ConsentType ConsentType,
    string ConsentTextVersion,
    string? IpAddress,
    string? UserAgent,
    /// <summary>GAP-021: ID of the Key Facts Statement acknowledged by the borrower.</summary>
    Guid KfsId,
    string ConsentLocale = "en") : ICommand<RecordConsentResponse>;

/// <summary>Response after recording consent.</summary>
public record RecordConsentResponse(Guid ConsentId, DateTime SignedAt);

/// <summary>Validates RecordConsentCommand.</summary>
public sealed class RecordConsentCommandValidator : AbstractValidator<RecordConsentCommand>
{
    public RecordConsentCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.ConsentType).IsInEnum();
        RuleFor(x => x.ConsentTextVersion).NotEmpty().MaximumLength(50);
        RuleFor(x => x.IpAddress).MaximumLength(45);  // IPv6 max length
        RuleFor(x => x.UserAgent).MaximumLength(512);
        // GAP-021: KFS id must be supplied
        RuleFor(x => x.KfsId)
            .NotEmpty()
            .WithMessage("KfsId is required. Obtain it from GET /loans/applications/{id}/kfs before consenting.");
        // GAP-040: locale must be a non-empty BCP-47 tag (e.g. "en", "hi", "ta", "bn")
        RuleFor(x => x.ConsentLocale)
            .NotEmpty()
            .MaximumLength(10)
            .WithMessage("ConsentLocale must be a BCP-47 language tag (e.g. \"en\", \"hi\").");
    }
}

/// <summary>Handler: records consent with HMAC signature and IDOR org-scoping.</summary>
public sealed class RecordConsentCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    IConsentHmacKeyProvider hmacKeyProvider) : ICommandHandler<RecordConsentCommand, RecordConsentResponse>
{
    /// <inheritdoc />
    public async Task<Result<RecordConsentResponse>> Handle(
        RecordConsentCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        var userId = currentUser.UserId;

        // IDOR: filter by org
        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        // GAP-021 / RBI DL Guidelines: validate that the referenced KFS was generated
        // for this application and has not already been used for a different consent.
        var kfs = await db.KeyFactsStatements
            .Where(k => k.Id == request.KfsId
                        && k.ApplicationId == request.ApplicationId
                        && k.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (kfs is null)
            return Result<RecordConsentResponse>.Failure(Error.Validation(
                "Consent.KfsNotFound",
                "The Key Facts Statement (KfsId) was not found for this application. " +
                "Generate a KFS via POST /loans/applications/{id}/kfs before submitting consent."));

        var signedAt = DateTime.UtcNow;

        // P6-HANDOFF-26: compute HMAC-SHA256 server-side
        var hmacKey = await hmacKeyProvider.GetKeyAsync(cancellationToken);
        var signature = ConsentSignature.Compute(userId, request.ApplicationId, request.ConsentTextVersion, signedAt, hmacKey);

        // Mark KFS as acknowledged (immutable — only set once).
        if (kfs.AcknowledgedAt is null)
            kfs.RecordAcknowledgement();

        var consent = new Consent
        {
            ApplicationId = request.ApplicationId,
            ConsentType = request.ConsentType,
            ConsentTextVersion = request.ConsentTextVersion,
            // GAP-040: record the locale served so DPDP audit trail is unambiguous.
            ConsentLocale = string.IsNullOrWhiteSpace(request.ConsentLocale) ? "en" : request.ConsentLocale.Trim().ToLowerInvariant(),
            SignedAt = signedAt,
            IpAddress = request.IpAddress,
            UserAgent = request.UserAgent,
            SignatureHash = signature.Hash,
            UserId = userId
        };

        db.Consents.Add(consent);
        await db.SaveChangesAsync(cancellationToken);
        return new RecordConsentResponse(consent.Id, signedAt);
    }
}
