using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Commands.UpdateOrgSettings;

/// <summary>
/// Updates the mutable self-service settings of the authenticated user's organization.
/// <para>
/// Editable by ORG_ADMIN tier (permission: <c>org.settings.update</c>):
/// <list type="bullet">
///   <item><description><c>Name</c> — organisation display name.</description></item>
///   <item><description><c>LogoUrl</c>, address fields.</description></item>
/// </list>
/// </para>
/// <para>
/// GSTIN and PanNumber are NOT accepted — they are KYC-verified legal identity fields
/// that require a re-verification flow. If a caller supplies <c>Gstin</c> the validator
/// returns a 400 with a clear message directing them to support.
/// </para>
/// SEC-056: backs PATCH /auth/org/settings.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgSettingsUpdate)]
public record UpdateOrgSettingsCommand(
    string? Name,
    string? LogoUrl,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? Pincode,
    /// <summary>
    /// Deliberately accepted but always rejected by the validator with a clear error.
    /// This makes the GSTIN-is-read-only contract explicit to API consumers.
    /// </summary>
    string? Gstin = null) : ICommand;

public sealed class UpdateOrgSettingsCommandValidator : AbstractValidator<UpdateOrgSettingsCommand>
{
    public UpdateOrgSettingsCommandValidator()
    {
        // GSTIN is read-only via this endpoint — reject with a clear, actionable message.
        RuleFor(x => x.Gstin)
            .Must(_ => false)
            .WithMessage("GSTIN changes require re-verification — contact support.")
            .When(x => x.Gstin is not null);

        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("Organisation name must not be empty.")
            .MaximumLength(255)
            .When(x => x.Name is not null);

        RuleFor(x => x.Pincode)
            .Matches(@"^\d{6}$")
            .WithMessage("Pincode must be exactly 6 digits.")
            .When(x => x.Pincode is not null);

        RuleFor(x => x.LogoUrl)
            .MaximumLength(2048)
            .When(x => x.LogoUrl is not null);

        RuleFor(x => x.AddressLine1)
            .MaximumLength(255)
            .When(x => x.AddressLine1 is not null);

        RuleFor(x => x.AddressLine2)
            .MaximumLength(255)
            .When(x => x.AddressLine2 is not null);

        RuleFor(x => x.City)
            .MaximumLength(100)
            .When(x => x.City is not null);

        RuleFor(x => x.State)
            .MaximumLength(100)
            .When(x => x.State is not null);
    }
}

public sealed class UpdateOrgSettingsCommandHandler(IAuthDbContext db, ICurrentUser currentUser)
    : ICommandHandler<UpdateOrgSettingsCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        UpdateOrgSettingsCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Result.Failure(
                Error.Forbidden("UpdateOrgSettings.NoOrg", "No active organization in token."));

        var org = await db.Organizations
            .FirstOrDefaultAsync(o => o.Id == orgId.Value && o.DeletedAt == null, cancellationToken);

        if (org is null)
            return Result.Failure(
                Error.NotFound("UpdateOrgSettings.OrgNotFound", "Organization not found."));

        org.UpdateSettings(
            request.Name,
            request.LogoUrl,
            request.AddressLine1,
            request.AddressLine2,
            request.City,
            request.State,
            request.Pincode);

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
