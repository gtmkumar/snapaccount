using AuthService.Application.Interfaces;
using AuthService.Domain;
using static AuthService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.PlatformAdmin.Commands.SuspendOrganization;

/// <summary>Suspends an organization (SUPER_ADMIN only). Sets IsActive=false on the org.</summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformOrgsSuspend)]
public record SuspendOrganizationCommand(Guid OrganizationId) : ICommand;

public sealed class SuspendOrganizationCommandHandler(
    IOrganizationRepository orgRepo)
    : ICommandHandler<SuspendOrganizationCommand>
{
    public async Task<Result> Handle(SuspendOrganizationCommand request, CancellationToken cancellationToken)
    {
        var org = await orgRepo.GetByIdAsync(request.OrganizationId, cancellationToken);
        if (org is null)
            return Result.Failure(Error.NotFound("Organization", request.OrganizationId));

        if (!org.IsActive)
            return Result.Failure(Error.Conflict("Organization.AlreadySuspended", "This organization is already suspended."));

        await orgRepo.SuspendAsync(request.OrganizationId, cancellationToken);
        return Result.Success();
    }
}
