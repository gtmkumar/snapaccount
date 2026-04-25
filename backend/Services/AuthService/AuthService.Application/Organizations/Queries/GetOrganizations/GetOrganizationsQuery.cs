using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Queries.GetOrganizations;

/// <summary>Returns the list of organizations the authenticated user belongs to.</summary>
public record GetOrganizationsQuery : IQuery<IReadOnlyList<OrganizationDto>>;

/// <summary>Read-only DTO for an organization the user is a member of.</summary>
public record OrganizationDto(
    Guid Id,
    string BusinessName,
    string? Gstin,
    string? PanNumber,
    string? BusinessType,
    bool IsGstRegistered,
    bool IsMsmeRegistered,
    bool IsActive);

/// <summary>
/// Returns all active organizations for the current user via the repository.
/// Filters out soft-deleted organizations; ordering is alphabetical by business name.
/// </summary>
public sealed class GetOrganizationsQueryHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : IQueryHandler<GetOrganizationsQuery, IReadOnlyList<OrganizationDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<OrganizationDto>>> Handle(
        GetOrganizationsQuery request,
        CancellationToken cancellationToken)
    {
        var orgs = await userRepository.GetOrganizationsAsync(currentUser.UserId, cancellationToken);

        var dtos = orgs
            .Where(o => o.DeletedAt == null)
            .Select(o => new OrganizationDto(
                o.Id, o.BusinessName, o.Gstin, o.PanNumber,
                o.BusinessType, o.IsGstRegistered, o.IsMsmeRegistered, o.IsActive))
            .ToList()
            .AsReadOnly();

        return Result<IReadOnlyList<OrganizationDto>>.Success(dtos);
    }
}
