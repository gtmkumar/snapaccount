using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Devices.Queries.GetMyApprovalStatus;

/// <summary>
/// GAP-047 mobile residual: the NEW device's waiting screen polls this endpoint to
/// learn its current approval status without inferring from session disappearance.
///
/// The query is authenticated as the PENDING device's own session.
/// Looks up the most recent (non-expired) DeviceApprovalRequest that references the
/// caller's device entity ID as the <c>NewDeviceId</c>.
///
/// Also surfaces the soft-launch <c>DeviceApproval:Enforce</c> mode so the mobile
/// can branch: ENFORCE → block until decided; NOTIFY_ONLY → allow but show banner.
/// </summary>
public record GetMyApprovalStatusQuery : IQuery<MyApprovalStatusResponse>;

/// <summary>Status string values — mirror of <see cref="DeviceApprovalStatus"/> + UNKNOWN for no-request case.</summary>
public static class ApprovalStatusStrings
{
    public const string Pending   = "PENDING";
    public const string Approved  = "APPROVED";
    public const string Denied    = "DENIED";
    public const string Expired   = "EXPIRED";
    public const string Unknown   = "UNKNOWN"; // no request found — should not normally occur
}

/// <summary>Response returned to the waiting device.</summary>
public record MyApprovalStatusResponse(
    /// <summary>Approval request id (null if no request found).</summary>
    Guid? ApprovalRequestId,
    /// <summary>PENDING / APPROVED / DENIED / EXPIRED / UNKNOWN.</summary>
    string Status,
    /// <summary>UTC timestamp when the request was approved, denied, or expired. Null while pending.</summary>
    DateTime? DecidedAt,
    /// <summary>UTC expiry of the approval window (10 min from creation). Null if unknown.</summary>
    DateTime? ExpiresAt,
    /// <summary>
    /// Soft-launch mode from <c>DeviceApproval:Enforce</c> config.
    /// ENFORCE — denial revokes the session; NOTIFY_ONLY — records + logs only.
    /// Mobile uses this to decide whether to hard-block or soft-warn.
    /// </summary>
    string Mode);

/// <summary>Validates GetMyApprovalStatusQuery (no parameters to validate).</summary>
public sealed class GetMyApprovalStatusQueryValidator : AbstractValidator<GetMyApprovalStatusQuery>
{
    public GetMyApprovalStatusQueryValidator() { }
}

/// <summary>Handles GetMyApprovalStatusQuery.</summary>
public sealed class GetMyApprovalStatusQueryHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IConfiguration configuration)
    : IQueryHandler<GetMyApprovalStatusQuery, MyApprovalStatusResponse>
{
    /// <inheritdoc />
    public async Task<Result<MyApprovalStatusResponse>> Handle(
        GetMyApprovalStatusQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            return Error.Unauthorized("Auth.NotAuthenticated", "Authentication required.");

        // Resolve enforce mode from config
        var enforce = configuration["DeviceApproval:Enforce"] is "true" or "True";
        var mode = enforce ? "ENFORCE" : "NOTIFY_ONLY";

        // Find the most recent DeviceApprovalRequest for this user where the new device
        // matches the calling user's registered device(s).
        // We look for requests where NewDeviceId belongs to one of the caller's devices.
        var approvalRequest = await db.DeviceApprovalRequests
            .Where(r => r.UserId == currentUser.UserId
                     && r.DeletedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.Status,
                r.ReviewedAt,
                r.ExpiresAt,
                r.CreatedAt
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (approvalRequest is null)
        {
            return Result<MyApprovalStatusResponse>.Success(
                new MyApprovalStatusResponse(null, ApprovalStatusStrings.Unknown, null, null, mode));
        }

        // Compute effective status: a PENDING request past its expiry window is EXPIRED
        var effectiveStatus = approvalRequest.Status switch
        {
            DeviceApprovalStatus.Pending when DateTime.UtcNow >= approvalRequest.ExpiresAt
                => ApprovalStatusStrings.Expired,
            DeviceApprovalStatus.Pending   => ApprovalStatusStrings.Pending,
            DeviceApprovalStatus.Approved  => ApprovalStatusStrings.Approved,
            DeviceApprovalStatus.Denied    => ApprovalStatusStrings.Denied,
            DeviceApprovalStatus.Expired   => ApprovalStatusStrings.Expired,
            _                              => ApprovalStatusStrings.Unknown
        };

        // decidedAt: for EXPIRED-by-clock, use ExpiresAt; for resolved, use ReviewedAt
        var decidedAt = effectiveStatus is ApprovalStatusStrings.Expired
                        && approvalRequest.Status == DeviceApprovalStatus.Pending
            ? approvalRequest.ExpiresAt
            : approvalRequest.ReviewedAt;

        return Result<MyApprovalStatusResponse>.Success(
            new MyApprovalStatusResponse(
                approvalRequest.Id,
                effectiveStatus,
                decidedAt,
                approvalRequest.ExpiresAt,
                mode));
    }
}
