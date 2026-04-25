using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Preferences.Commands.UpdatePreferences;

/// <summary>Updates the authenticated user's notification and display preferences.</summary>
/// <param name="PreferredLanguage">BCP-47 language tag (e.g. "en", "hi", "ta").</param>
/// <param name="Theme">LIGHT, DARK, or SYSTEM.</param>
public record UpdatePreferencesCommand(
    string PreferredLanguage,
    string Theme,
    bool PushNotificationsEnabled,
    bool SmsNotificationsEnabled,
    bool EmailNotificationsEnabled,
    bool WhatsappNotificationsEnabled) : ICommand;

/// <summary>FluentValidation validator for <see cref="UpdatePreferencesCommand"/>.</summary>
public sealed class UpdatePreferencesCommandValidator : AbstractValidator<UpdatePreferencesCommand>
{
    public UpdatePreferencesCommandValidator()
    {
        RuleFor(x => x.Theme)
            .Must(t => t is "LIGHT" or "DARK" or "SYSTEM")
            .WithMessage("Theme must be LIGHT, DARK, or SYSTEM.");

        RuleFor(x => x.PreferredLanguage)
            .NotEmpty()
            .MaximumLength(20);
    }
}

/// <summary>
/// Applies preference updates to the user's <see cref="AuthService.Domain.Entities.UserPreference"/>
/// aggregate child and persists via the repository.
/// </summary>
public sealed class UpdatePreferencesCommandHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : ICommandHandler<UpdatePreferencesCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        UpdatePreferencesCommand request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", currentUser.UserId));

        // Update preferred language on the user aggregate
        user.PreferredLanguage = request.PreferredLanguage;

        // Update preference child entity if it exists
        if (user.Preference is not null)
        {
            user.Preference.PreferredLanguage = request.PreferredLanguage;
            user.Preference.Theme = request.Theme;
            user.Preference.PushNotificationsEnabled = request.PushNotificationsEnabled;
            user.Preference.SmsNotificationsEnabled = request.SmsNotificationsEnabled;
            user.Preference.EmailNotificationsEnabled = request.EmailNotificationsEnabled;
            user.Preference.WhatsappNotificationsEnabled = request.WhatsappNotificationsEnabled;
        }

        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }
}
