using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Queries.GetCurrentUser;

/// <summary>Returns the profile of the currently authenticated user.</summary>
public record GetCurrentUserQuery : IQuery<GetCurrentUserResponse>;

/// <summary>Read-only DTO for the current user's profile data.</summary>
/// <param name="PanNumber">Decrypted PAN (SEC-013: decrypted on read, never returned encrypted).</param>
public record GetCurrentUserResponse(
    Guid UserId,
    string? PhoneNumber,
    string? Email,
    string? FullName,
    bool IsPhoneVerified,
    bool IsEmailVerified,
    string PreferredLanguage,
    string? PanNumber,
    string? AadhaarLast4,
    string KycStatus,
    DateTime? LastLoginAt,
    // Persona discriminator (BUSINESS_OWNER | EMPLOYEE | STAFF). Null when the user
    // has no profile yet (brand-new account that hasn't completed onboarding) — the
    // mobile client uses this both to drive persona-specific navigation and to decide
    // whether a returning user still needs to pick a persona.
    string? UserType = null);

/// <summary>
/// Loads the user aggregate via the repository (for PAN decryption context),
/// decrypts the PAN field using <see cref="IPanEncryptionService"/>, and returns
/// a read-only <see cref="GetCurrentUserResponse"/> DTO.
///
/// SEC-013: The DB stores AES-256 encrypted PAN. Decryption happens here — the
/// caller always receives plaintext PAN to authorised requests. If decryption fails
/// (e.g. a legacy plaintext row), the raw value is returned as a safe fallback.
/// </summary>
public sealed class GetCurrentUserQueryHandler(
    IUserRepository userRepository,
    IPanEncryptionService panEncryptionService,
    ICurrentUser currentUser)
    : IQueryHandler<GetCurrentUserQuery, GetCurrentUserResponse>
{
    /// <inheritdoc />
    public async Task<Result<GetCurrentUserResponse>> Handle(
        GetCurrentUserQuery request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Error.NotFound("User", currentUser.UserId);

        // SEC-013: Decrypt PAN — never return the encrypted value to API consumers.
        string? plaintextPan = null;
        if (!string.IsNullOrEmpty(user.Profile?.PanNumber))
        {
            try
            {
                plaintextPan = panEncryptionService.Decrypt(user.Profile.PanNumber);
            }
            catch
            {
                // Legacy plaintext row before encryption migration — safe to return as-is.
                plaintextPan = user.Profile.PanNumber;
            }
        }

        return new GetCurrentUserResponse(
            user.Id,
            user.PhoneNumber,
            user.Email,
            user.FullName,
            user.IsPhoneVerified,
            user.IsEmailVerified,
            user.PreferredLanguage,
            plaintextPan,
            user.Profile?.AadhaarLast4,
            user.Profile?.KycStatus ?? "PENDING",
            user.LastLoginAt,
            user.Profile?.UserType);
    }
}
