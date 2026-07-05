using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Queries.GetVerificationPolicy;

/// <summary>
/// Response for the verification policy endpoint.
/// Mobile/mobile clients call this to determine whether to show the OTP flow.
/// </summary>
/// <param name="GovernmentVerificationEnabled">
/// True when the user's organization requires OTP-based government verification for all
/// document kinds (PAN/AADHAAR/GSTIN/TAN). False when the org has not enabled it,
/// or when the user has no organization membership.
/// </param>
public record VerificationPolicyResponse(bool GovernmentVerificationEnabled);

/// <summary>
/// GET /auth/me/organization/verification-policy (RequireAuthorization)
/// Returns the <c>governmentVerificationEnabled</c> flag for the current user's organization.
/// If the user has no active org membership, returns false (permissive default).
/// </summary>
public record GetVerificationPolicyQuery : IQuery<VerificationPolicyResponse>;

/// <summary>Handles <see cref="GetVerificationPolicyQuery"/>.</summary>
public sealed class GetVerificationPolicyQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetVerificationPolicyQuery, VerificationPolicyResponse>
{
    /// <inheritdoc />
    public async Task<Result<VerificationPolicyResponse>> Handle(
        GetVerificationPolicyQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Resolve the user's primary active org via membership
        var govEnabled = await db.OrganizationMembers
            .Where(m => m.UserId == userId && m.IsActive && m.DeletedAt == null)
            .Join(db.Organizations.Where(o => o.IsActive && o.DeletedAt == null),
                m => m.OrganizationId,
                o => o.Id,
                (m, o) => o.GovernmentVerificationEnabled)
            .FirstOrDefaultAsync(cancellationToken);

        // govEnabled is false (default bool) when the user has no active org membership
        return new VerificationPolicyResponse(govEnabled);
    }
}
