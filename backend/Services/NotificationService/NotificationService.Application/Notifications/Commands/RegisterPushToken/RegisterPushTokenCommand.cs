using FluentValidation;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.RegisterPushToken;

/// <summary>Registers or refreshes an FCM push token for a user's device.</summary>
public record RegisterPushTokenCommand(
    Guid UserId,
    string DeviceId,
    string Token,
    string Platform) : ICommand;

/// <summary>Validates the register push token command.</summary>
public sealed class RegisterPushTokenCommandValidator : AbstractValidator<RegisterPushTokenCommand>
{
    public RegisterPushTokenCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Token).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Platform).Must(p => p is "ios" or "android")
            .WithMessage("Platform must be 'ios' or 'android'.");
    }
}

/// <summary>Handles <see cref="RegisterPushTokenCommand"/>. Upserts the token for the device.</summary>
public sealed class RegisterPushTokenCommandHandler(INotificationDbContext dbContext)
    : ICommandHandler<RegisterPushTokenCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RegisterPushTokenCommand request, CancellationToken cancellationToken)
    {
        var existing = await dbContext.PushTokens
            .FirstOrDefaultAsync(t => t.UserId == request.UserId && t.DeviceId == request.DeviceId, cancellationToken);

        if (existing is not null)
        {
            // Deactivate the old token and add a fresh one
            existing.Deactivate();
        }

        var newToken = PushToken.Create(request.UserId, request.DeviceId, request.Token, request.Platform);
        dbContext.PushTokens.Add(newToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
