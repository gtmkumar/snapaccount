using AuthService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Commands.UpdateOrgSettings;

/// <summary>
/// Updates the mutable self-service settings of the authenticated user's organization.
/// Identity-critical fields (BusinessName, Gstin, PanNumber) are NOT accepted here —
/// those require a KYC re-verification flow.
/// SEC-056: backs PATCH /auth/org/settings.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgSettingsUpdate)]
public record UpdateOrgSettingsCommand(
    string? LogoUrl,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? Pincode) : ICommand;

public sealed class UpdateOrgSettingsCommandValidator : AbstractValidator<UpdateOrgSettingsCommand>
{
    public UpdateOrgSettingsCommandValidator()
    {
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
