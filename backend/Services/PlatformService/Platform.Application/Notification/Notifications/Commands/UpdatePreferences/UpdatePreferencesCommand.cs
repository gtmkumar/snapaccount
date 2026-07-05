using FluentValidation;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.UpdatePreferences;

/// <summary>Updates notification preferences for a user/event pair.</summary>
public record UpdatePreferencesCommand(
    Guid UserId,
    string EventCode,
    bool PushEnabled,
    bool SmsEnabled,
    bool EmailEnabled,
    bool InAppEnabled,
    string? QuietHoursStart = null,
    string? QuietHoursEnd = null,
    bool DoNotDisturb = false) : ICommand;

/// <summary>Validates the update preferences command.</summary>
public sealed class UpdatePreferencesCommandValidator : AbstractValidator<UpdatePreferencesCommand>
{
    public UpdatePreferencesCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.EventCode).NotEmpty().MaximumLength(100);
        RuleFor(x => x.QuietHoursStart)
            .Matches(@"^\d{2}:\d{2}$").When(x => x.QuietHoursStart is not null)
            .WithMessage("QuietHoursStart must be HH:mm format.");
        RuleFor(x => x.QuietHoursEnd)
            .Matches(@"^\d{2}:\d{2}$").When(x => x.QuietHoursEnd is not null)
            .WithMessage("QuietHoursEnd must be HH:mm format.");
    }
}

/// <summary>Handles <see cref="UpdatePreferencesCommand"/>.</summary>
public sealed class UpdatePreferencesCommandHandler(INotificationDbContext dbContext)
    : ICommandHandler<UpdatePreferencesCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(UpdatePreferencesCommand request, CancellationToken cancellationToken)
    {
        var prefs = await dbContext.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == request.UserId && p.EventCode == request.EventCode, cancellationToken);

        if (prefs is null)
        {
            prefs = NotificationPreference.CreateDefault(request.UserId, request.EventCode);
            dbContext.NotificationPreferences.Add(prefs);
        }

        prefs.UpdateChannels(
            request.PushEnabled, request.SmsEnabled, request.EmailEnabled, request.InAppEnabled,
            request.QuietHoursStart, request.QuietHoursEnd, request.DoNotDisturb);

        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
