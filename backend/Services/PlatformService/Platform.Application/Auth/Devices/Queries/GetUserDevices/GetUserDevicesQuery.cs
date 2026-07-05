using AuthService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Queries.GetUserDevices;

/// <summary>Returns the list of registered devices for the authenticated user.</summary>
public record GetUserDevicesQuery : IQuery<IReadOnlyList<DeviceDto>>;

/// <summary>Read-only DTO representing a registered user device.</summary>
public record DeviceDto(
    Guid Id,
    string DeviceId,
    string? DeviceName,
    string Platform,
    string? OsVersion,
    string? AppVersion,
    bool IsActive,
    DateTime? LastActiveAt,
    DateTime BoundAt);

/// <summary>
/// Retrieves the user's active registered devices via the repository.
/// Query handlers use <see cref="IUserRepository"/> for device projection because devices
/// are part of the User aggregate; the <see cref="AuthService.Application.Common.Interfaces.IAuthDbContext"/>
/// direct-projection path is used by simpler queries that do not require aggregate loading.
/// </summary>
public sealed class GetUserDevicesQueryHandler(
    IUserRepository userRepository,
    ICurrentUser currentUser)
    : IQueryHandler<GetUserDevicesQuery, IReadOnlyList<DeviceDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DeviceDto>>> Handle(
        GetUserDevicesQuery request,
        CancellationToken cancellationToken)
    {
        var devices = await userRepository.GetDevicesAsync(currentUser.UserId, cancellationToken);

        var dtos = devices
            .Where(d => d.DeletedAt == null)
            .Select(d => new DeviceDto(
                d.Id, d.DeviceId, d.DeviceName, d.Platform,
                d.OsVersion, d.AppVersion, d.IsActive, d.LastActiveAt, d.BoundAt))
            .ToList()
            .AsReadOnly();

        return Result<IReadOnlyList<DeviceDto>>.Success(dtos);
    }
}
