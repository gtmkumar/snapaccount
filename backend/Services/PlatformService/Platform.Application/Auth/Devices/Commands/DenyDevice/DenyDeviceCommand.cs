using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Commands.DenyDevice;

/// <summary>
/// GAP-047: Deny a pending new-device login from an existing registered device.
///
/// When <c>DeviceApproval:Enforce</c> = true:
/// - The new device row is deactivated (IsActive=false).
/// - The associated session/refresh token is revoked.
///
/// When <c>DeviceApproval:Enforce</c> = false (default — soft-launch):
/// - The denial is recorded and logged, but the new device session is NOT revoked.
/// - An event is published for monitoring dashboards.
///
/// Same-device guard: the reviewing device must differ from the new device being denied.
/// </summary>
public record DenyDeviceCommand(
    Guid ApprovalRequestId,
    Guid ReviewingDeviceEntityId,
    string? Reason = null) : ICommand<DenyDeviceResponse>;

/// <summary>Response after denying a device.</summary>
public record DenyDeviceResponse(
    Guid ApprovalRequestId,
    string Status,
    DateTime ReviewedAt,
    bool Enforced);

/// <summary>Validates DenyDeviceCommand.</summary>
public sealed class DenyDeviceCommandValidator : AbstractValidator<DenyDeviceCommand>
{
    public DenyDeviceCommandValidator()
    {
        RuleFor(x => x.ApprovalRequestId).NotEmpty();
        RuleFor(x => x.ReviewingDeviceEntityId).NotEmpty();
        RuleFor(x => x.Reason).MaximumLength(500).When(x => x.Reason is not null);
    }
}

/// <summary>Handles device denial from an existing registered device.</summary>
public sealed class DenyDeviceCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IConfiguration configuration,
    ILogger<DenyDeviceCommandHandler> logger)
    : ICommandHandler<DenyDeviceCommand, DenyDeviceResponse>
{
    /// <inheritdoc />
    public async Task<Result<DenyDeviceResponse>> Handle(
        DenyDeviceCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("DeviceApproval.NotAuthenticated", "Authentication required.");

        var userId = currentUser.UserId;

        // Verify reviewing device belongs to this user and is active (IDOR)
        var callerDevice = await db.UserDevices
            .FirstOrDefaultAsync(d => d.Id == request.ReviewingDeviceEntityId
                                      && d.UserId == userId
                                      && d.IsActive
                                      && d.DeletedAt == null,
                cancellationToken);
        if (callerDevice is null)
            return Result<DenyDeviceResponse>.Failure(Error.Forbidden(
                "DeviceApproval.InvalidReviewingDevice",
                "The reviewing device is not registered or is not active on your account."));

        // Load approval request — scoped to this user
        var approvalRequest = await db.DeviceApprovalRequests
            .FirstOrDefaultAsync(r => r.Id == request.ApprovalRequestId
                                      && r.UserId == userId
                                      && r.DeletedAt == null,
                cancellationToken);

        if (approvalRequest is null)
            return Error.NotFound("DeviceApprovalRequest", request.ApprovalRequestId);

        if (!approvalRequest.IsActive)
            return Result<DenyDeviceResponse>.Failure(Error.Conflict(
                "DeviceApproval.Expired",
                "The approval request has expired or has already been resolved."));

        // Same-device guard
        if (approvalRequest.NewDeviceId == request.ReviewingDeviceEntityId)
            return Result<DenyDeviceResponse>.Failure(Error.Conflict(
                "DeviceApproval.SameDevice",
                "A device cannot deny its own new-device request."));

        var denyResult = approvalRequest.Deny(callerDevice.Id, request.Reason);
        if (denyResult.IsFailure)
            return Result<DenyDeviceResponse>.Failure(denyResult.Error);

        var enforce = configuration["DeviceApproval:Enforce"] is "true" or "True";
        var enforced = false;

        if (enforce)
        {
            // Enforce mode: deactivate the new device entity
            var newDevice = await db.UserDevices
                .FirstOrDefaultAsync(d => d.Id == approvalRequest.NewDeviceId && d.DeletedAt == null,
                    cancellationToken);
            if (newDevice is not null)
            {
                newDevice.Deactivate();
            }

            // Revoke any refresh token associated with the new device session
            if (approvalRequest.NewDeviceSessionTokenId.HasValue)
            {
                var token = await db.RefreshTokens
                    .FirstOrDefaultAsync(t => t.Id == approvalRequest.NewDeviceSessionTokenId.Value
                                              && !t.IsRevoked,
                        cancellationToken);
                if (token is not null)
                {
                    token.Revoke("Device approval denied — session revoked");
                }
            }

            enforced = true;
        }

        await db.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "DeviceApproval: request {Id} DENIED by device {ReviewingDevice} " +
            "(enforce={Enforce}, reason={Reason})",
            request.ApprovalRequestId, callerDevice.Id, enforce, request.Reason ?? "none");

        return new DenyDeviceResponse(
            approvalRequest.Id,
            DeviceApprovalStatus.Denied.ToString(),
            approvalRequest.ReviewedAt!.Value,
            Enforced: enforced);
    }
}
