using FluentValidation;
using NotificationService.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Queries.GetPreferences;

/// <summary>Returns all notification preferences for a user.</summary>
public record GetPreferencesQuery(Guid UserId) : IQuery<PreferencesDto>;

/// <summary>All preferences for a user.</summary>
public record PreferencesDto(IReadOnlyList<PreferenceItem> Items);

/// <summary>One preference item.</summary>
public record PreferenceItem(
    string EventCode,
    bool PushEnabled,
    bool SmsEnabled,
    bool EmailEnabled,
    bool InAppEnabled,
    string? QuietHoursStart,
    string? QuietHoursEnd,
    bool DoNotDisturb);

/// <summary>Validates the preferences query.</summary>
public sealed class GetPreferencesQueryValidator : AbstractValidator<GetPreferencesQuery>
{
    public GetPreferencesQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
    }
}

/// <summary>Handles <see cref="GetPreferencesQuery"/>.</summary>
public sealed class GetPreferencesQueryHandler(INotificationDbContext dbContext)
    : IQueryHandler<GetPreferencesQuery, PreferencesDto>
{
    /// <inheritdoc />
    public async Task<Result<PreferencesDto>> Handle(GetPreferencesQuery request, CancellationToken cancellationToken)
    {
        var items = await dbContext.NotificationPreferences
            .Where(p => p.UserId == request.UserId && p.DeletedAt == null)
            .Select(p => new PreferenceItem(
                p.EventCode, p.PushEnabled, p.SmsEnabled, p.EmailEnabled, p.InAppEnabled,
                p.QuietHoursStart, p.QuietHoursEnd, p.DoNotDisturb))
            .ToListAsync(cancellationToken);

        return new PreferencesDto(items);
    }
}
