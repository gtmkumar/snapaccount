using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Common.Guards;

/// <summary>
/// TASK A — Org-context validation guard.
///
/// Before any org-scoped write (create role, grant permissions, invite, update/suspend/remove member)
/// we must confirm that:
///   1. The caller's JWT carries a non-empty OrganizationId.
///   2. That org row actually exists in the database (FK-safe check).
///   3. For non-SUPER_ADMIN callers, the user holds an active membership in that org.
///
/// Without this guard, a stale token (e.g. a pre-fix all-zeros org id or a deleted org)
/// would propagate to the INSERT and produce PostgresException 23503 (FK violation → HTTP 500).
/// With this guard the caller receives a clean 409 Conflict with a human-readable message.
///
/// Error code: Org.InvalidContext
/// HTTP mapping: 409 Conflict (the session context is inconsistent with the DB state)
/// </summary>
public static class OrgContextGuard
{
    /// <summary>Error code returned when the session's org id cannot be validated.</summary>
    public const string ErrorCode = "Org.InvalidContext";

    /// <summary>
    /// Validates that <paramref name="currentUser"/>'s OrganizationId is non-empty, the org
    /// row exists, and (when <paramref name="requireMembership"/> is true and the caller is
    /// not SUPER_ADMIN) the user has an active membership row in that org.
    ///
    /// Returns <c>null</c> on success (callers destructure <c>orgId</c> themselves).
    /// Returns a <see cref="Result{T}"/>-shaped error via the <see cref="Error"/> factory on failure.
    /// </summary>
    public static async Task<(Guid OrgId, Error? Failure)> ValidateAsync(
        IAuthDbContext db,
        ICurrentUser currentUser,
        bool requireMembership,
        CancellationToken ct)
    {
        // 1. OrganizationId must be present and non-empty
        if (!currentUser.OrganizationId.HasValue || currentUser.OrganizationId.Value == Guid.Empty)
        {
            return (Guid.Empty, Error.Conflict(
                ErrorCode,
                "Your session does not carry a valid organization context. Please sign in again."));
        }

        var orgId = currentUser.OrganizationId.Value;

        // 2. The org row must exist (protects against all-zeros or orphaned ids)
        var orgExists = await db.Organizations
            .AnyAsync(o => o.Id == orgId && o.DeletedAt == null, ct);

        if (!orgExists)
        {
            return (Guid.Empty, Error.Conflict(
                ErrorCode,
                "Your session's organization is no longer valid — please sign in again."));
        }

        // 3. Non-SUPER_ADMIN must have an active membership row in that org
        var isSuperAdmin = currentUser.HasPermission(Domain.Permissions.PlatformOrgsRead)
                        || currentUser.HasPermission("*");

        if (requireMembership && !isSuperAdmin)
        {
            var isMember = await db.OrganizationMembers
                .AnyAsync(m =>
                    m.OrganizationId == orgId &&
                    m.UserId == currentUser.UserId &&
                    m.IsActive &&
                    m.DeletedAt == null, ct);

            if (!isMember)
            {
                return (Guid.Empty, Error.Conflict(
                    ErrorCode,
                    "Your session's organization is no longer valid — please sign in again."));
            }
        }

        return (orgId, null);
    }
}
