using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.RevokeConsent;

/// <summary>
/// Revokes a previously recorded loan consent per DPDP Act 2023 s.6
/// (right to withdraw consent) and RBI Digital Lending Guidelines.
///
/// DG-LOAN-04: The original signed consent record is NEVER deleted or mutated —
/// revocation is append-only: <c>revoked_at</c> and <c>revocation_reason</c> are
/// stamped on the existing row. The signature and DPDP audit trail remain intact
/// for the 7-year statutory retention window.
///
/// A revoked <see cref="ConsentType.DataShareWithBank"/> or
/// <see cref="ConsentType.DisbursementMandate"/> consent MUST block further bank
/// data-sharing and disbursement (enforced in the relevant downstream handlers).
/// </summary>
/// <param name="ApplicationId">The loan application the consent belongs to.</param>
/// <param name="ConsentId">The specific consent record to revoke.</param>
/// <param name="Reason">Optional plain-language reason for revocation.</param>
[RequiresPermission("loan.application.consent")]
public record RevokeConsentCommand(
    Guid ApplicationId,
    Guid ConsentId,
    string? Reason = null) : ICommand<RevokeConsentResponse>;

/// <summary>Response confirming revocation.</summary>
public record RevokeConsentResponse(
    Guid ConsentId,
    string ConsentType,
    DateTime RevokedAt,
    string? Reason);

/// <summary>Validates <see cref="RevokeConsentCommand"/>.</summary>
public sealed class RevokeConsentCommandValidator : AbstractValidator<RevokeConsentCommand>
{
    public RevokeConsentCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.ConsentId).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500).When(x => x.Reason is not null);
    }
}

/// <summary>
/// Marks the specified consent as revoked (DPDP s.6 append-only).
/// Guards:
///  - IDOR: application must belong to the caller's org.
///  - Already-revoked: returns the existing revocation timestamp (idempotent).
///  - Not found: 404 when the consent or application is not found.
/// </summary>
public sealed class RevokeConsentCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RevokeConsentCommand, RevokeConsentResponse>
{
    /// <inheritdoc />
    public async Task<Result<RevokeConsentResponse>> Handle(
        RevokeConsentCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: verify the application belongs to the caller's org.
        var appExists = await db.LoanApplications
            .AnyAsync(
                a => a.Id == request.ApplicationId
                     && a.OrgId == orgId
                     && a.DeletedAt == null,
                cancellationToken);

        if (!appExists)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        // Load the consent (no soft-delete filter — consents have no deleted_at).
        var consent = await db.Consents
            .FirstOrDefaultAsync(
                c => c.Id == request.ConsentId
                     && c.ApplicationId == request.ApplicationId,
                cancellationToken);

        if (consent is null)
            return Error.NotFound("Consent", request.ConsentId);

        // Idempotent: if already revoked, return the existing revocation details.
        if (consent.IsRevoked)
        {
            return new RevokeConsentResponse(
                consent.Id,
                consent.ConsentType.ToString(),
                consent.RevokedAt!.Value,
                consent.RevocationReason);
        }

        // Apply revocation (domain method is idempotent as a guard).
        consent.Revoke(request.Reason);

        await db.SaveChangesAsync(cancellationToken);

        return new RevokeConsentResponse(
            consent.Id,
            consent.ConsentType.ToString(),
            consent.RevokedAt!.Value,
            consent.RevocationReason);
    }
}
