using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Queries.GetOrgSettings;

/// <summary>
/// Returns the current organization's mutable settings for the self-service admin panel.
/// SEC-056: backs GET /auth/org/settings.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.OrgSettingsRead)]
public record GetOrgSettingsQuery : IQuery<OrgSettingsDto>;

/// <summary>Organization settings shape returned by GET /auth/org/settings.</summary>
public record OrgSettingsDto(
    string Name,
    string? Gstin,
    string? Phone,
    string? Email,
    string? LogoUrl,
    string? AddressLine1,
    string? City,
    string? State,
    string? Pincode);

public sealed class GetOrgSettingsQueryHandler(IAuthDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetOrgSettingsQuery, OrgSettingsDto>
{
    public async Task<Result<OrgSettingsDto>> Handle(
        GetOrgSettingsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Result<OrgSettingsDto>.Failure(
                Error.Forbidden("GetOrgSettings.NoOrg", "No active organization in token."));

        var org = await db.Organizations
            .Where(o => o.Id == orgId.Value && o.DeletedAt == null)
            .Select(o => new
            {
                o.BusinessName,
                o.Gstin,
                o.LogoUrl,
                o.AddressLine1,
                o.City,
                o.State,
                o.Pincode,
                o.OwnerUserId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (org is null)
            return Result<OrgSettingsDto>.Failure(
                Error.NotFound("GetOrgSettings.OrgNotFound", "Organization not found."));

        // Phone/Email live on the owner User record, not the org itself
        var ownerContact = await db.Users
            .Where(u => u.Id == org.OwnerUserId && u.DeletedAt == null)
            .Select(u => new { u.PhoneNumber, u.Email })
            .FirstOrDefaultAsync(cancellationToken);

        return Result<OrgSettingsDto>.Success(new OrgSettingsDto(
            Name: org.BusinessName,
            Gstin: org.Gstin,
            Phone: ownerContact?.PhoneNumber,
            Email: ownerContact?.Email,
            LogoUrl: org.LogoUrl,
            AddressLine1: org.AddressLine1,
            City: org.City,
            State: org.State,
            Pincode: org.Pincode));
    }
}
