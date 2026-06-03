using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Preferences.Queries.GetPreferences;

/// <summary>Returns the authenticated user's display and notification preferences.</summary>
public record GetPreferencesQuery : IQuery<UserPreferenceDto>;

/// <summary>
/// Read-only DTO representing a user's current preference settings.
/// All notification flags default to <see langword="true"/> and Theme defaults to
/// <c>"SYSTEM"</c> when no <c>UserPreference</c> row exists yet.
/// </summary>
public record UserPreferenceDto(
    string PreferredLanguage,
    string Theme,
    bool PushNotificationsEnabled,
    bool SmsNotificationsEnabled,
    bool EmailNotificationsEnabled,
    bool WhatsappNotificationsEnabled);

/// <summary>
/// Loads the user aggregate (which includes the <c>UserPreference</c> child via
/// <c>IUserRepository</c>) and projects to <see cref="UserPreferenceDto"/>.
/// When no preference row exists yet, sensible defaults are returned
/// (Theme = SYSTEM, language from user.PreferredLanguage, all notifications enabled).
/// </summary>
public sealed class GetPreferencesQueryHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : IQueryHandler<GetPreferencesQuery, UserPreferenceDto>
{
    /// <inheritdoc />
    public async Task<Result<UserPreferenceDto>> Handle(
        GetPreferencesQuery request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Error.NotFound("User", currentUser.UserId);

        if (user.Preference is not null)
        {
            return new UserPreferenceDto(
                user.Preference.PreferredLanguage,
                user.Preference.Theme,
                user.Preference.PushNotificationsEnabled,
                user.Preference.SmsNotificationsEnabled,
                user.Preference.EmailNotificationsEnabled,
                user.Preference.WhatsappNotificationsEnabled);
        }

        // No preference row yet — return defaults derived from the user aggregate.
        return new UserPreferenceDto(
            PreferredLanguage: user.PreferredLanguage,
            Theme: "SYSTEM",
            PushNotificationsEnabled: true,
            SmsNotificationsEnabled: true,
            EmailNotificationsEnabled: true,
            WhatsappNotificationsEnabled: false);
    }
}
