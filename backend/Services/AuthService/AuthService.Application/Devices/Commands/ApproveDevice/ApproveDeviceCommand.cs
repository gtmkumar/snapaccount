using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Commands.ApproveDevice;

/// <summary>
/// GAP-047: Approve a pending new-device login from an existing registered device.
///
/// Security constraints:
/// - The caller MUST be authenticated with a DIFFERENT device than the one being approved.
/// - The caller MUST have at least one active registered device (cannot be on a device-less session).
/// - The approval request must still be within its 10-minute expiry window.
///
/// Soft-launch: <c>DeviceApproval:Enforce</c> config flag (default false) — when false,
/// the flow is observe-only (approval recorded but no enforcement).
/// </summary>
public record ApproveDeviceCommand(
    Guid ApprovalRequestId,
    /// <summary>The reviewing device's entity ID (from GET /auth/devices). Must differ from the pending device.</summary>
    Guid ReviewingDeviceEntityId) : ICommand<ApproveDeviceResponse>;

/// <summary>Response after approving a device.</summary>
public record ApproveDeviceResponse(Guid ApprovalRequestId, string Status, DateTime ReviewedAt);

/// <summary>Validates ApproveDeviceCommand.</summary>
public sealed class ApproveDeviceCommandValidator : AbstractValidator<ApproveDeviceCommand>
{
    public ApproveDeviceCommandValidator()
    {
        RuleFor(x => x.ApprovalRequestId).NotEmpty();
        RuleFor(x => x.ReviewingDeviceEntityId).NotEmpty();
    }
}

/// <summary>Handles device approval from an existing registered device.</summary>
public sealed class ApproveDeviceCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IConfiguration configuration,
    ILogger<ApproveDeviceCommandHandler> logger)
    : ICommandHandler<ApproveDeviceCommand, ApproveDeviceResponse>
{
    /// <inheritdoc />
    public async Task<Result<ApproveDeviceResponse>> Handle(
        ApproveDeviceCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("DeviceApproval.NotAuthenticated", "Authentication required.");

        var userId = currentUser.UserId;

        // Verify the reviewing device belongs to this user (IDOR) and is active
        var callerDevice = await db.UserDevices
            .FirstOrDefaultAsync(d => d.Id == request.ReviewingDeviceEntityId
                                      && d.UserId == userId
                                      && d.IsActive
                                      && d.DeletedAt == null,
                cancellationToken);
        if (callerDevice is null)
            return Result<ApproveDeviceResponse>.Failure(Error.Forbidden(
                "DeviceApproval.InvalidReviewingDevice",
                "The reviewing device is not registered or is not active on your account."));

        // Load the pending approval request — scoped to this user for IDOR safety
        var approvalRequest = await db.DeviceApprovalRequests
            .FirstOrDefaultAsync(r => r.Id == request.ApprovalRequestId
                                      && r.UserId == userId
                                      && r.DeletedAt == null,
                cancellationToken);

        if (approvalRequest is null)
            return Error.NotFound("DeviceApprovalRequest", request.ApprovalRequestId);

        if (!approvalRequest.IsActive)
            return Result<ApproveDeviceResponse>.Failure(Error.Conflict(
                "DeviceApproval.Expired",
                "The approval request has expired or has already been resolved."));

        // Security: the approving device must be a DIFFERENT device than the one being approved
        if (approvalRequest.NewDeviceId == request.ReviewingDeviceEntityId)
            return Result<ApproveDeviceResponse>.Failure(Error.Conflict(
                "DeviceApproval.SameDevice",
                "A device cannot approve its own new-device request. An existing device must perform the approval."));

        var approveResult = approvalRequest.Approve(callerDevice.Id);
        if (approveResult.IsFailure)
            return Result<ApproveDeviceResponse>.Failure(approveResult.Error);

        await db.SaveChangesAsync(cancellationToken);

        var enforce = configuration["DeviceApproval:Enforce"] is "true" or "True";
        logger.LogInformation(
            "DeviceApproval: request {Id} APPROVED by device {ReviewingDevice} (enforce={Enforce})",
            request.ApprovalRequestId, request.ReviewingDeviceEntityId, enforce);

        return new ApproveDeviceResponse(
            approvalRequest.Id,
            DeviceApprovalStatus.Approved.ToString(),
            approvalRequest.ReviewedAt!.Value);
    }
}
