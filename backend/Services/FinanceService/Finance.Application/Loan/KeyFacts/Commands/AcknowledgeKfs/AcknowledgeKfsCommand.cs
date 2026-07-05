using FluentValidation;
using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.KeyFacts.Commands.AcknowledgeKfs;

/// <summary>
/// Records that the borrower has read and understood the Key Facts Statement.
///
/// DG-LOAN-05: The mobile KFS screen (KeyFactsStatementScreen) calls this standalone
/// acknowledge endpoint BEFORE navigating to LoanConsentScreen. The returned
/// <see cref="AcknowledgeKfsResponse.AcknowledgementId"/> is carried forward into the
/// consent submission so each consent record is tied to the exact KFS the borrower saw
/// (RBI Digital Lending Guidelines 2022 — "informed-before-consent" chain).
///
/// Design notes:
///  - Idempotent: if the KFS is already acknowledged, returns the existing timestamp.
///  - This endpoint is a READ-RECEIPT only — no biometric step-up, no consent text signed.
///  - <c>RecordConsentCommand</c> performs a complementary KFS acknowledgement on the DB row;
///    both paths converge on <c>kfs.RecordAcknowledgement()</c>.
/// </summary>
/// <param name="ApplicationId">The loan application the KFS belongs to.</param>
/// <param name="KfsId">The specific KFS row being acknowledged.</param>
/// <param name="DeviceId">Masked device id for DPDP audit trail (optional but recommended).</param>
[RequiresPermission("loan.application.consent")]
public record AcknowledgeKfsCommand(
    Guid ApplicationId,
    Guid KfsId,
    string? DeviceId = null) : ICommand<AcknowledgeKfsResponse>;

/// <summary>Acknowledgement confirmation returned to the mobile client.</summary>
public record AcknowledgeKfsResponse(
    /// <summary>
    /// Echoes the KFS id so the mobile client can pass it forward to LoanConsentScreen
    /// without re-parsing the response.
    /// </summary>
    Guid AcknowledgementId,
    DateTime AcknowledgedAt);

/// <summary>Validates <see cref="AcknowledgeKfsCommand"/>.</summary>
public sealed class AcknowledgeKfsCommandValidator : AbstractValidator<AcknowledgeKfsCommand>
{
    public AcknowledgeKfsCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.KfsId).NotEmpty();
        RuleFor(x => x.DeviceId).MaximumLength(128).When(x => x.DeviceId is not null);
    }
}

/// <summary>
/// Marks the specified KFS row as acknowledged by the borrower.
/// Guards:
///  - IDOR: application must belong to the caller's org.
///  - Idempotent: returns existing <c>AcknowledgedAt</c> if already set.
///  - Not found: 404 when the KFS or application is not found.
/// </summary>
public sealed class AcknowledgeKfsCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<AcknowledgeKfsCommand, AcknowledgeKfsResponse>
{
    /// <inheritdoc />
    public async Task<Result<AcknowledgeKfsResponse>> Handle(
        AcknowledgeKfsCommand request,
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

        var kfs = await db.KeyFactsStatements
            .FirstOrDefaultAsync(
                k => k.Id == request.KfsId
                     && k.ApplicationId == request.ApplicationId
                     && k.DeletedAt == null,
                cancellationToken);

        if (kfs is null)
            return Error.NotFound("KeyFactsStatement", request.KfsId);

        // Idempotent: if already acknowledged return the existing timestamp.
        if (kfs.AcknowledgedAt.HasValue)
        {
            return new AcknowledgeKfsResponse(kfs.Id, kfs.AcknowledgedAt.Value);
        }

        kfs.RecordAcknowledgement();
        await db.SaveChangesAsync(cancellationToken);

        return new AcknowledgeKfsResponse(kfs.Id, kfs.AcknowledgedAt!.Value);
    }
}
