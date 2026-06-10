using AuthService.Application.Interfaces;
using FluentValidation;
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
/// </summary>
public record RefreshContextCommand : ICommand<RefreshContextResponse>;

/// <summary>
/// Response carrying the re-issued access token and its expiry time.
/// The caller should swap the in-memory access token transparently.
/// </summary>
/// <param name="AccessToken">New HS256 session JWT with up-to-date RBAC + org claims.</param>
/// <param name="ExpiresAt">UTC expiry of the new token.</param>
public record RefreshContextResponse(string AccessToken, DateTime ExpiresAt);

/// <summary>Validator — no body fields needed; validation is identity-based.</summary>
public sealed class RefreshContextCommandValidator : AbstractValidator<RefreshContextCommand>
{
    // No input fields to validate; the command is driven purely by the authenticated identity.
}

/// <summary>
/// Re-mints the session JWT using the same <see cref="IFirebaseAuthService.CreateCustomTokenAsync"/>
/// path used at login, so claims are always consistent with the current DB state.
/// </summary>
public sealed class RefreshContextCommandHandler(
    IFirebaseAuthService firebaseAuthService,
    IUserRepository userRepository,
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

        // Re-resolve all RBAC claims from the DB — this picks up the new OrganizationId
        // membership row written by CreateOrganizationCommandHandler.
        var tokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            user.FirebaseUid ?? user.Id.ToString(),
            new Dictionary<string, object> { ["userId"] = user.Id.ToString() },
            cancellationToken);

        if (tokenResult.IsFailure)
            return tokenResult.Error;

        // Session tokens are issued for 12 h (matches FirebaseAuthService.SessionTokenLifetime).
        var expiresAt = DateTime.UtcNow.AddHours(12);

        return new RefreshContextResponse(tokenResult.Value, expiresAt);
    }
}
