using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the auth schema database context.
///
/// Following the Jason Taylor CleanArchitecture pattern, query handlers depend on
/// this interface (not the concrete <c>AuthDbContext</c>) so they can project
/// directly via LINQ without going through a repository for read operations.
/// Write-side command handlers that operate on aggregates continue to use the
/// repository interfaces (<see cref="AuthService.Application.Interfaces.IUserRepository"/> etc.)
/// for full aggregate loading, transactional behaviour, and invariant enforcement.
///
/// The concrete <c>AuthDbContext</c> in Infrastructure implements this interface.
/// DI wires it up as: <c>services.AddScoped&lt;IAuthDbContext&gt;(sp =&gt; sp.GetRequiredService&lt;AuthDbContext&gt;())</c>.
/// </summary>
public interface IAuthDbContext
{
    /// <summary>Users in the <c>auth.users</c> table.</summary>
    DbSet<User> Users { get; }

    /// <summary>User profiles in <c>auth.user_profiles</c>.</summary>
    DbSet<UserProfile> UserProfiles { get; }

    /// <summary>Organizations in <c>auth.organizations</c>.</summary>
    DbSet<Organization> Organizations { get; }

    /// <summary>Organization membership records in <c>auth.organization_members</c>.</summary>
    DbSet<OrganizationMember> OrganizationMembers { get; }

    /// <summary>Role definitions in <c>auth.roles</c>.</summary>
    DbSet<Role> Roles { get; }

    /// <summary>Permission definitions in <c>auth.permissions</c>.</summary>
    DbSet<Permission> Permissions { get; }

    /// <summary>Role-permission mappings in <c>auth.role_permissions</c>.</summary>
    DbSet<RolePermission> RolePermissions { get; }

    /// <summary>User-role assignments in <c>auth.user_roles</c>.</summary>
    DbSet<UserRole> UserRoles { get; }

    /// <summary>Registered user devices in <c>auth.user_devices</c>.</summary>
    DbSet<UserDevice> UserDevices { get; }

    /// <summary>OTP request log in <c>auth.otp_requests</c>.</summary>
    DbSet<OtpRequest> OtpRequests { get; }

    /// <summary>Refresh tokens in <c>auth.refresh_tokens</c>.</summary>
    DbSet<RefreshToken> RefreshTokens { get; }

    /// <summary>User preferences in <c>auth.user_preferences</c>.</summary>
    DbSet<UserPreference> UserPreferences { get; }

    /// <summary>Org invitations in <c>auth.invitation</c>.</summary>
    DbSet<Invitation> Invitations { get; }

    /// <summary>Direct user permission grants in <c>auth.user_permission</c>.</summary>
    DbSet<UserPermission> UserPermissions { get; }

    /// <summary>Reference / lookup data entries in <c>auth.reference_data</c>.</summary>
    DbSet<AuthService.Domain.Entities.ReferenceData> ReferenceData { get; }

    /// <summary>
    /// Read-only projection of <c>shared.audit_log</c>. All services write to
    /// the same partitioned table; AuthService exposes the admin-only read
    /// path for the cross-service audit-feed widget. Never write through this DbSet.
    /// </summary>
    DbSet<AuditLogEntry> AuditEvents { get; }

    /// <summary>Persists changes to the auth schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
