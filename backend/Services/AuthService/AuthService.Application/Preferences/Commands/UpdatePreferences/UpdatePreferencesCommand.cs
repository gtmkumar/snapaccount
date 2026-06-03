using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Preferences.Commands.UpdatePreferences;

/// <summary>
/// Updates the authenticated user's notification and display preferences.
/// All fields are nullable — a <see langword="null"/> value means "keep the existing
/// value". The handler merges incoming non-null fields over the current
/// <see cref="AuthService.Domain.Entities.UserPreference"/> row (or defaults when no
/// row exists yet). This allows clients to PATCH individual fields without needing
/// to supply all values.
/// </summary>
/// <param name="PreferredLanguage">BCP-47 language tag (e.g. "en", "hi", "ta"). Null = keep current.</param>
/// <param name="Theme">LIGHT, DARK, or SYSTEM. Null = keep current.</param>
public record UpdatePreferencesCommand(
    string? PreferredLanguage,
    string? Theme,
    bool? PushNotificationsEnabled,
    bool? SmsNotificationsEnabled,
    bool? EmailNotificationsEnabled,
    bool? WhatsappNotificationsEnabled) : ICommand;

/// <summary>FluentValidation validator for <see cref="UpdatePreferencesCommand"/>.</summary>
public sealed class UpdatePreferencesCommandValidator : AbstractValidator<UpdatePreferencesCommand>
{
    private static readonly string[] ValidThemes = ["LIGHT", "DARK", "SYSTEM"];

    public UpdatePreferencesCommandValidator()
    {
        When(x => x.Theme is not null, () =>
            RuleFor(x => x.Theme!)
                .Must(t => ValidThemes.Contains(t))
                .WithMessage("Theme must be LIGHT, DARK, or SYSTEM."));

        When(x => x.PreferredLanguage is not null, () =>
            RuleFor(x => x.PreferredLanguage!)
                .NotEmpty()
                .MaximumLength(20)
                .WithMessage("PreferredLanguage must be a non-empty BCP-47 tag of at most 20 characters."));
    }
}

/// <summary>
/// Merges the non-null fields of the incoming command over the user's existing
/// <see cref="AuthService.Domain.Entities.UserPreference"/> (or defaults when no row
/// exists yet), then persists via the repository.
/// </summary>
public sealed class UpdatePreferencesCommandHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : ICommandHandler<UpdatePreferencesCommand>
{
    // Default values applied when no UserPreference row exists.
    private const string DefaultTheme = "SYSTEM";
    private const string DefaultLanguage = "en";

    /// <inheritdoc />
    public async Task<Result> Handle(
        UpdatePreferencesCommand request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", currentUser.UserId));

        // Resolve current values — from existing preference row or from defaults.
        var currentLang  = user.Preference?.PreferredLanguage ?? user.PreferredLanguage ?? DefaultLanguage;
        var currentTheme = user.Preference?.Theme ?? DefaultTheme;
        var currentPush  = user.Preference?.PushNotificationsEnabled ?? true;
        var currentSms   = user.Preference?.SmsNotificationsEnabled ?? true;
        var currentEmail = user.Preference?.EmailNotificationsEnabled ?? true;
        var currentWa    = user.Preference?.WhatsappNotificationsEnabled ?? false;

        // Merge: use incoming value when provided, otherwise keep current.
        var mergedLang  = request.PreferredLanguage ?? currentLang;
        var mergedTheme = request.Theme ?? currentTheme;
        var mergedPush  = request.PushNotificationsEnabled ?? currentPush;
        var mergedSms   = request.SmsNotificationsEnabled ?? currentSms;
        var mergedEmail = request.EmailNotificationsEnabled ?? currentEmail;
        var mergedWa    = request.WhatsappNotificationsEnabled ?? currentWa;

        // Update preferred language on the user aggregate root as well.
        user.PreferredLanguage = mergedLang;

        if (user.Preference is not null)
        {
            // Row already exists — mutate in place; EF tracks as Modified.
            user.Preference.PreferredLanguage            = mergedLang;
            user.Preference.Theme                        = mergedTheme;
            user.Preference.PushNotificationsEnabled     = mergedPush;
            user.Preference.SmsNotificationsEnabled      = mergedSms;
            user.Preference.EmailNotificationsEnabled    = mergedEmail;
            user.Preference.WhatsappNotificationsEnabled = mergedWa;
        }
        else
        {
            // No preference row exists yet — create one and attach it to the aggregate.
            // UserRepository.UpdateAsync detects the Detached state and issues an INSERT.
            var newPref = new AuthService.Domain.Entities.UserPreference
            {
                UserId                       = user.Id,
                PreferredLanguage            = mergedLang,
                Theme                        = mergedTheme,
                PushNotificationsEnabled     = mergedPush,
                SmsNotificationsEnabled      = mergedSms,
                EmailNotificationsEnabled    = mergedEmail,
                WhatsappNotificationsEnabled = mergedWa
            };
            user.SetPreference(newPref);
        }

        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }
}
