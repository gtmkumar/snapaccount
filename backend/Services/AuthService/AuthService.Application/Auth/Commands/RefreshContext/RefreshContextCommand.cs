using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Auth.Commands.RefreshContext;

/// <summary>
/// GAP-007 / BUG-5: Re-issues the session JWT for the authenticated user with their
/// current RBAC claims, including the <c>OrganizationId</c> that is populated AFTER
/// the business-onboarding wizard creates the organisation.
///
/// The mobile client calls this immediately after <c>POST /auth/organizations</c> completes
/// so subsequent calls (e.g. <c>POST /auth/team/invite</c>) see the correct org context
/// without requiring a full sign-out and re-login.
///
/// No new refresh token is issued — the caller's existing opaque refresh token remains valid.
/// Use <c>POST /auth/token/refresh</c> to also rotate the refresh token.
///
/// ORG-SWITCHER (mobile Wave 6): When <see cref="OrganizationId"/> is provided the handler
/// validates the caller has an ACTIVE, non-soft-deleted membership in that org before minting
/// the JWT with that org's claims. An invalid or deleted membership returns 403/400 — the caller
/// is never silently redirected to a different org. This is the entire security gate; there is
/// no other caller-supplied claim accepted by the token minting path.
/// </summary>
/// <param name="OrganizationId">
/// Optional org hint from the mobile org-switcher. When present the minted JWT uses this org's
/// claims. When absent, the behaviour is unchanged: most-recently-created active membership wins.
/// </param>
public record RefreshContextCommand(Guid? OrganizationId = null) : ICommand<RefreshContextResponse>;

/// <summary>
/// Response carrying the re-issued access token and its expiry time.
/// The caller should swap the in-memory access token transparently.
/// </summary>
/// <param name="AccessToken">New HS256 session JWT with up-to-date RBAC + org claims.</param>
/// <param name="ExpiresAt">UTC expiry of the new token.</param>
/// <param name="OrganizationId">The org whose claims are embedded in the token (echo for mobile).</param>
public record RefreshContextResponse(string AccessToken, DateTime ExpiresAt, Guid? OrganizationId = null);

/// <summary>Validator — OrganizationId, if present, must be a non-empty GUID.</summary>
public sealed class RefreshContextCommandValidator : AbstractValidator<RefreshContextCommand>
{
    public RefreshContextCommandValidator()
    {
        RuleFor(x => x.OrganizationId)
            .NotEqual(Guid.Empty)
            .WithMessage("OrganizationId must be a valid non-empty GUID when provided.")
            .When(x => x.OrganizationId.HasValue);
    }
}

/// <summary>
/// Re-mints the session JWT using the same <see cref="IFirebaseAuthService.CreateCustomTokenAsync"/>
/// path used at login, so claims are always consistent with the current DB state.
///
/// Security: when <see cref="RefreshContextCommand.OrganizationId"/> is set this handler
/// verifies the caller has an active membership in that org BEFORE minting any token.
/// The membership check IS the security gate — without it the mobile could craft arbitrary
/// org claims.
/// </summary>
public sealed class RefreshContextCommandHandler(
    IFirebaseAuthService firebaseAuthService,
    IUserRepository userRepository,
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<RefreshContextCommand, RefreshContextResponse>
{
    /// <inheritdoc />
    public async Task<Result<RefreshContextResponse>> Handle(
        RefreshContextCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.UserId == Guid.Empty)
            return Error.Unauthorized("Auth.NotAuthenticated", "You must be authenticated to refresh context.");

        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null || !user.IsActive)
            return Error.NotFound("User", currentUser.UserId);

        // ── Org-switcher security gate ─────────────────────────────────────────
        // When a specific org is requested, validate the caller has an active, non-soft-deleted
        // membership in that org. A missing, inactive, or deleted membership is rejected with
        // Forbidden — never silently falling back to a different org.
        if (request.OrganizationId.HasValue)
        {
            var targetOrgId = request.OrganizationId.Value;
            var membershipActive = await db.OrganizationMembers
                .AnyAsync(m => m.UserId == currentUser.UserId
                               && m.OrganizationId == targetOrgId
                               && m.IsActive
                               && m.DeletedAt == null,
                    cancellationToken);

            if (!membershipActive)
                return Error.Forbidden(
                    "Auth.OrgSwitchForbidden",
                    $"User does not have an active membership in organization {targetOrgId}.");
        }

        // Re-resolve all RBAC claims from the DB — this picks up the new OrganizationId
        // membership row written by CreateOrganizationCommandHandler.
        // Pass explicit orgId hint so BuildSessionClaimsAsync uses it instead of the default
        // most-recently-created selection.
        var claims = new Dictionary<string, object>
        {
            ["userId"] = user.Id.ToString(),
        };
        if (request.OrganizationId.HasValue)
            claims["explicitOrgId"] = request.OrganizationId.Value.ToString();

        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            user.FirebaseUid ?? user.Id.ToString(),
            claims,
            cancellationToken);

        if (tokenResult.IsFailure)
            return tokenResult.Error;

        // Session tokens are issued for 12 h (matches FirebaseAuthService.SessionTokenLifetime).
        var expiresAt = DateTime.UtcNow.AddHours(12);

        return new RefreshContextResponse(tokenResult.Value, expiresAt, request.OrganizationId);
    }
}
