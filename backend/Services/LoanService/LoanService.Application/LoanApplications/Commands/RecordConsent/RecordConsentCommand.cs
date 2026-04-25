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
/// </summary>
[RequiresPermission("loan.application.consent")]
public record RecordConsentCommand(
    Guid ApplicationId,
    ConsentType ConsentType,
    string ConsentTextVersion,
    string? IpAddress,
    string? UserAgent) : ICommand<RecordConsentResponse>;

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

        var signedAt = DateTime.UtcNow;

        // P6-HANDOFF-26: compute HMAC-SHA256 server-side
        var hmacKey = await hmacKeyProvider.GetKeyAsync(cancellationToken);
        var signature = ConsentSignature.Compute(userId, request.ApplicationId, request.ConsentTextVersion, signedAt, hmacKey);

        var consent = new Consent
        {
            ApplicationId = request.ApplicationId,
            ConsentType = request.ConsentType,
            ConsentTextVersion = request.ConsentTextVersion,
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
