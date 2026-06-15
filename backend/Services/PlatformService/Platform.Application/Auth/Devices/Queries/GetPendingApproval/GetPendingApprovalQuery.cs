using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Queries.GetPendingApproval;

/// <summary>
/// GAP-047: Returns pending device approval requests for the authenticated user.
/// Mobile pushes an approval request notification to existing devices; those devices
/// call this endpoint to render the "New device login — approve or deny?" screen.
/// </summary>
public record GetPendingApprovalsQuery : IQuery<PendingApprovalsResponse>;

/// <summary>Response containing pending device approval requests for this user.</summary>
public record PendingApprovalsResponse(IReadOnlyList<DeviceApprovalDto> Pending);

/// <summary>A single pending device approval request.</summary>
public record DeviceApprovalDto(
    Guid ApprovalRequestId,
    Guid NewDeviceId,
    string NewDeviceIdentifier,
    string? NewDeviceName,
    string NewDevicePlatform,
    DateTime ExpiresAt,
    DateTime CreatedAt);

/// <summary>Validates GetPendingApprovalsQuery.</summary>
public sealed class GetPendingApprovalsQueryValidator : AbstractValidator<GetPendingApprovalsQuery>
{
    public GetPendingApprovalsQueryValidator() { } // No params to validate
}

/// <summary>Projects pending approval requests for the authenticated user.</summary>
public sealed class GetPendingApprovalsQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetPendingApprovalsQuery, PendingApprovalsResponse>
{
    /// <inheritdoc />
    public async Task<Result<PendingApprovalsResponse>> Handle(
        GetPendingApprovalsQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("Auth.NotAuthenticated", "Authentication required.");

        var now = DateTime.UtcNow;
        var pending = await db.DeviceApprovalRequests
            .Where(r => r.UserId == currentUser.UserId
                        && r.Status == DeviceApprovalStatus.Pending
                        && r.ExpiresAt > now
                        && r.DeletedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new DeviceApprovalDto(
                r.Id,
                r.NewDeviceId,
                r.NewDeviceIdentifier,
                r.NewDeviceName,
                r.NewDevicePlatform,
                r.ExpiresAt,
                r.CreatedAt))
            .ToListAsync(cancellationToken);

        return new PendingApprovalsResponse(pending.AsReadOnly());
    }
}
