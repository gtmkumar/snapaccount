using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PlatformAdmin.Commands.UpdateOrganizationSettings;

/// <summary>
/// Response after successfully updating an organization's settings.
/// Kept thin — callers read the updated flag(s) from here without a separate GET.
/// </summary>
/// <param name="OrganizationId">The organization whose settings were updated.</param>
/// <param name="GovernmentVerificationEnabled">Current value after the update.</param>
public record UpdateOrganizationSettingsResponse(
    Guid OrganizationId,
    bool GovernmentVerificationEnabled);

/// <summary>
/// PATCH /auth/admin/organizations/{orgId}/settings
/// Updates configurable settings on an organization.
/// Shape is extensible — new settings can be added as nullable fields without breaking callers.
/// </summary>
/// <param name="OrganizationId">Target organization id (from route).</param>
/// <param name="GovernmentVerificationEnabled">
/// When true, every document kind (PAN/AADHAAR/GSTIN/TAN) requires OTP-based government
/// verification before moving to VERIFIED status.
/// </param>
[RequiresPermission(AuthService.Domain.Permissions.OrgSettingsUpdate)]
public record UpdateOrganizationSettingsCommand(
    Guid OrganizationId,
    bool GovernmentVerificationEnabled) : ICommand<UpdateOrganizationSettingsResponse>;

/// <summary>FluentValidation validator for <see cref="UpdateOrganizationSettingsCommand"/>.</summary>
public sealed class UpdateOrganizationSettingsCommandValidator
    : AbstractValidator<UpdateOrganizationSettingsCommand>
{
    public UpdateOrganizationSettingsCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty().WithMessage("OrganizationId is required.");
    }
}

/// <summary>Handles the settings update — loads the org aggregate, calls the domain method, persists.</summary>
public sealed class UpdateOrganizationSettingsCommandHandler(
    IOrganizationRepository organizationRepository)
    : ICommandHandler<UpdateOrganizationSettingsCommand, UpdateOrganizationSettingsResponse>
{
    /// <inheritdoc />
    public async Task<Result<UpdateOrganizationSettingsResponse>> Handle(
        UpdateOrganizationSettingsCommand request,
        CancellationToken cancellationToken)
    {
        var org = await organizationRepository.GetByIdAsync(request.OrganizationId, cancellationToken);
        if (org is null)
            return Error.NotFound("Organization.NotFound",
                $"Organization '{request.OrganizationId}' was not found.");

        org.SetGovernmentVerification(request.GovernmentVerificationEnabled);
        await organizationRepository.UpdateAsync(org, cancellationToken);

        return new UpdateOrganizationSettingsResponse(org.Id, org.GovernmentVerificationEnabled);
    }
}
