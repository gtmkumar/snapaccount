using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Commands.RemoveDevice;

/// <summary>Removes (deactivates) a registered device from the authenticated user's account.</summary>
public record RemoveDeviceCommand(Guid DeviceId) : ICommand;

/// <summary>
/// Loads the user aggregate, delegates device removal to the domain method,
/// and persists the updated aggregate.
/// </summary>
public sealed class RemoveDeviceCommandHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : ICommandHandler<RemoveDeviceCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        RemoveDeviceCommand request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", currentUser.UserId));

        var result = user.RemoveDevice(request.DeviceId);
        if (result.IsFailure)
            return result;

        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }
}
