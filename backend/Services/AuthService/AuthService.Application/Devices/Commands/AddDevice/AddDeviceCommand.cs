using AuthService.Application.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Commands.AddDevice;

/// <summary>Adds a registered device to the authenticated user's account.</summary>
/// <param name="DeviceId">Platform-unique device identifier (e.g. Android ANDROID_ID).</param>
/// <param name="DeviceName">Human-readable device name (optional).</param>
/// <param name="Platform">ANDROID, IOS, or WEB.</param>
/// <param name="OsVersion">Operating system version string (optional).</param>
/// <param name="AppVersion">App build version string (optional).</param>
/// <param name="FcmToken">Firebase Cloud Messaging push token (optional).</param>
public record AddDeviceCommand(
    string DeviceId,
    string? DeviceName,
    string Platform,
    string? OsVersion,
    string? AppVersion,
    string? FcmToken) : ICommand<AddDeviceResponse>;

/// <summary>Response returned after a device is successfully added.</summary>
public record AddDeviceResponse(Guid DeviceEntityId);

/// <summary>FluentValidation validator for <see cref="AddDeviceCommand"/>.</summary>
public sealed class AddDeviceCommandValidator : AbstractValidator<AddDeviceCommand>
{
    public AddDeviceCommandValidator()
    {
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Platform)
            .Must(p => p is "ANDROID" or "IOS" or "WEB")
            .WithMessage("Platform must be ANDROID, IOS, or WEB.");
    }
}

/// <summary>
/// Adds a device to the user's account.
/// SEC-016: uses a SERIALIZABLE transaction to prevent race conditions on the
/// max-2-devices check under concurrent requests.
/// </summary>
public sealed class AddDeviceCommandHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : ICommandHandler<AddDeviceCommand, AddDeviceResponse>
{
    /// <inheritdoc />
    public async Task<Result<AddDeviceResponse>> Handle(
        AddDeviceCommand request,
        CancellationToken cancellationToken)
    {
        // SEC-016: Serializable transaction prevents two concurrent requests from
        // both seeing count < 2 and both succeeding.
        var user = await userRepository.GetByIdWithSerializableTransactionAsync(
            currentUser.UserId, cancellationToken);

        if (user is null)
            return Error.NotFound("User", currentUser.UserId);

        var result = user.AddDevice(
            request.DeviceId,
            request.DeviceName ?? "Unknown Device",
            request.Platform,
            request.OsVersion,
            request.AppVersion,
            request.FcmToken);

        if (result.IsFailure)
            return result.Error;

        await userRepository.UpdateAsync(user, cancellationToken);

        var device = user.Devices.Last();
        return new AddDeviceResponse(device.Id);
    }
}
