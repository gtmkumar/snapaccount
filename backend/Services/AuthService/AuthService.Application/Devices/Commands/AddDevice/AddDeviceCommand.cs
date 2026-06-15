using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
///
/// GAP-047: When the user already has at least one existing device, creates a
/// <see cref="DeviceApprovalRequest"/> (10-min expiry) and publishes a push event to existing devices.
/// Soft-launch: <c>DeviceApproval:Enforce</c> (default false) means this is observe-only.
/// </summary>
public sealed class AddDeviceCommandHandler(
    IUserRepository userRepository,
    IAuthDbContext db,
    IEventPublisher eventPublisher,
    ICurrentUser currentUser,
    IConfiguration configuration,
    ILogger<AddDeviceCommandHandler> logger)
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

        // GAP-047: Check if the user already has registered devices BEFORE adding the new one.
        // If yes, we'll create a DeviceApprovalRequest after AddDevice.
        var existingActiveDeviceCount = user.Devices.Count(d => d.IsActive && d.DeletedAt == null);
        var hasExistingDevices = existingActiveDeviceCount > 0;

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

        // GAP-047: Create approval request when this is a second (or later) device login
        if (hasExistingDevices)
        {
            var approvalRequest = DeviceApprovalRequest.Create(
                userId: user.Id,
                newDeviceId: device.Id,
                newDeviceIdentifier: request.DeviceId,
                newDeviceName: request.DeviceName,
                newDevicePlatform: request.Platform);

            db.DeviceApprovalRequests.Add(approvalRequest);
            await db.SaveChangesAsync(cancellationToken);

            // Publish push notification to existing devices via NotificationService Pub/Sub topic
            // (SEC-007 pattern: never call NotificationService directly)
            var enforce = configuration["DeviceApproval:Enforce"] is "true" or "True";
            logger.LogInformation(
                "GAP-047: New device login for user {UserId}, device {DeviceId}. " +
                "ApprovalRequest {ApprovalId} created (enforce={Enforce}). " +
                "Publishing push to {ExistingCount} existing device(s).",
                user.Id, device.Id, approvalRequest.Id, enforce, existingActiveDeviceCount);

            try
            {
                await eventPublisher.PublishAsync(
                    "device-approval-requests",
                    new DeviceApprovalRequestedEvent(
                        user.Id,
                        approvalRequest.Id,
                        device.Id,
                        request.DeviceId,
                        request.DeviceName ?? "Unknown Device",
                        request.Platform,
                        approvalRequest.ExpiresAt),
                    cancellationToken);
            }
            catch (Exception ex)
            {
                // Publishing failure must never block device registration — log and continue.
                // The user can check pending approvals via GET /auth/devices/pending-approvals.
                logger.LogError(ex,
                    "GAP-047: Failed to publish DeviceApprovalRequestedEvent for request {ApprovalId}. " +
                    "Device was added but push notification was not delivered.",
                    approvalRequest.Id);
            }
        }

        return new AddDeviceResponse(device.Id);
    }
}
