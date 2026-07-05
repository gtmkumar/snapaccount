using AuthService.Application.Common.Interfaces;
using AuthService.Application.Privacy.Common;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Commands.WithdrawConsent;

/// <summary>
/// Withdraws the calling user's consent for a specific processing purpose.
///
/// A new <see cref="UserConsent"/> row is appended with Status = "withdrawn".
/// The operation is idempotent — withdrawing an already-withdrawn purpose
/// is a no-op (returns Success without writing a duplicate row).
/// </summary>
/// <param name="Purpose">The processing purpose code to withdraw consent for.</param>
/// <param name="NoticeVersion">Version of the privacy notice the user was shown.</param>
/// <param name="IpAddress">IP of the requesting device (injected by the endpoint).</param>
/// <param name="UserAgent">User-Agent of the requesting device (injected by the endpoint).</param>
/// <param name="Locale">Locale of the privacy notice (BCP-47 tag). Defaults to "en".</param>
public record WithdrawConsentCommand(
    string Purpose,
    string NoticeVersion,
    string? IpAddress,
    string? UserAgent,
    string Locale = "en") : ICommand;

/// <summary>FluentValidation validator for <see cref="WithdrawConsentCommand"/>.</summary>
public sealed class WithdrawConsentCommandValidator : AbstractValidator<WithdrawConsentCommand>
{
    public WithdrawConsentCommandValidator()
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
/// Appends a withdrawal consent record for the given purpose.
/// The existing consent history is never modified — only a new row is written.
/// </summary>
public sealed class WithdrawConsentCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<WithdrawConsentCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        WithdrawConsentCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Check if currently granted — skip if already withdrawn (idempotency).
        var latest = await db.UserConsents
            .Where(c => c.UserId == userId && c.Purpose == request.Purpose && c.DeletedAt == null)
            .OrderByDescending(c => c.ActionAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest is not null && latest.Status == "withdrawn")
            return Result.Success();   // already withdrawn — idempotent

        var description = ConsentPurposes.DescriptionFor(request.Purpose);

        var withdrawal = UserConsent.Withdraw(
            userId,
            request.Purpose,
            description,
            request.NoticeVersion,
            request.IpAddress,
            request.UserAgent,
            request.Locale);

        db.UserConsents.Add(withdrawal);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
