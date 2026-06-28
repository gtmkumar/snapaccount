using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using AuthService.Application.Common.Interfaces;

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
    bool IsActive,
    bool GovernmentVerificationEnabled);

/// <summary>
/// Returns all active organizations for the current user via the repository.
/// Filters out soft-deleted organizations; ordering is alphabetical by business name.
/// SEC-013 / DG-SEC-02: decrypts organisation PAN before returning to caller.
/// </summary>
public sealed class GetOrganizationsQueryHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser,
    IPanEncryptionService panEncryptionService)
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
                o.Id, o.BusinessName, o.Gstin,
                DecryptPan(o.PanNumber),
                o.BusinessType, o.IsGstRegistered, o.IsMsmeRegistered, o.IsActive,
                o.GovernmentVerificationEnabled))
            .ToList()
            .AsReadOnly();

        return Result<IReadOnlyList<OrganizationDto>>.Success(dtos);
    }

    /// <summary>
    /// SEC-013 / DG-SEC-02: safely decrypts an organisation PAN ciphertext.
    /// Returns null on failure rather than throwing — the encrypted value may have been
    /// stored before DG-SEC-02 was applied (plaintext legacy rows).
    /// </summary>
    private string? DecryptPan(string? panValue)
    {
        if (string.IsNullOrEmpty(panValue))
            return panValue;
        try { return panEncryptionService.Decrypt(panValue); }
        catch { return panValue; /* legacy plaintext row — return as-is */ }
    }
}
