using AuthService.Application.Common.Interfaces;
using AuthService.Application.Privacy.Common;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Commands.GrantConsent;

/// <summary>
/// Records the calling user's affirmative consent for a specific processing purpose
/// (GAP-DPDP-CONSENT-01 — DPDP Act 2023 requires capturing the affirmative consent record).
///
/// A new <see cref="UserConsent"/> row is appended with Status = "granted". The operation is
/// idempotent for an already-granted purpose (no duplicate row), but re-granting a purpose the
/// user previously withdrew DOES append a fresh granted row so the append-only audit trail
/// captures the re-consent.
/// </summary>
/// <param name="Purpose">The dot-lowercase processing purpose code to grant consent for.</param>
/// <param name="NoticeVersion">Version of the privacy notice the user was shown.</param>
/// <param name="IpAddress">IP of the requesting device (injected by the endpoint).</param>
/// <param name="UserAgent">User-Agent of the requesting device (injected by the endpoint).</param>
/// <param name="Locale">Locale of the privacy notice (BCP-47 tag). Defaults to "en".</param>
public record GrantConsentCommand(
    string Purpose,
    string NoticeVersion,
    string? IpAddress,
    string? UserAgent,
    string Locale = "en") : ICommand;

/// <summary>FluentValidation validator for <see cref="GrantConsentCommand"/>.</summary>
public sealed class GrantConsentCommandValidator : AbstractValidator<GrantConsentCommand>
{
    public GrantConsentCommandValidator()
    {
        RuleFor(x => x.Purpose)
            .NotEmpty().MaximumLength(200)
            .Matches(ConsentPurposes.CodePattern)
            .WithMessage("Purpose must be a dot-separated lowercase code, e.g. 'marketing.sms'.");

        RuleFor(x => x.NoticeVersion)
            .NotEmpty().MaximumLength(50);
    }
}

/// <summary>
/// Appends a granted consent record for the given purpose.
/// The existing consent history is never modified — only a new row is written.
/// </summary>
public sealed class GrantConsentCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<GrantConsentCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        GrantConsentCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Inspect the latest row for this purpose — skip if already granted (idempotency).
        var latest = await db.UserConsents
            .Where(c => c.UserId == userId && c.Purpose == request.Purpose && c.DeletedAt == null)
            .OrderByDescending(c => c.ActionAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest is not null && latest.Status == "granted")
            return Result.Success();   // already granted — idempotent, no duplicate row

        var grant = UserConsent.Grant(
            userId,
            request.Purpose,
            ConsentPurposes.DescriptionFor(request.Purpose),
            request.NoticeVersion,
            request.IpAddress,
            request.UserAgent,
            request.Locale);

        db.UserConsents.Add(grant);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
