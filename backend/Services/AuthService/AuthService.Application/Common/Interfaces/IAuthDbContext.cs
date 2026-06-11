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

    /// <summary>Backend-driven navigation menu entries in <c>auth.navigation_item</c>.</summary>
    DbSet<NavigationItem> NavigationItems { get; }

    /// <summary>Menu→permission visibility mappings in <c>auth.menu_permission</c>.</summary>
    DbSet<MenuPermission> MenuPermissions { get; }

    /// <summary>Configurable permission resources in <c>auth.resource_type</c> (gap #3).</summary>
    DbSet<ResourceType> ResourceTypes { get; }

    /// <summary>Configurable permission actions in <c>auth.action_type</c> (gap #3).</summary>
    DbSet<ActionType> ActionTypes { get; }

    /// <summary>Reference / lookup data entries in <c>auth.reference_data</c>.</summary>
    DbSet<AuthService.Domain.Entities.ReferenceData> ReferenceData { get; }

    /// <summary>
    /// Read-only projection of <c>shared.audit_log</c>. All services write to
    /// the same partitioned table; AuthService exposes the admin-only read
    /// path for the cross-service audit-feed widget. Never write through this DbSet.
    /// </summary>
    DbSet<AuditLogEntry> AuditEvents { get; }

    /// <summary>Platform-wide AI configuration (single row) in <c>auth.ai_configuration</c>.</summary>
    DbSet<AiConfiguration> AiConfigurations { get; }

    /// <summary>Encrypted AI provider API keys in <c>auth.ai_provider_key</c>.</summary>
    DbSet<AiProviderKey> AiProviderKeys { get; }

    /// <summary>Maintained AI model price catalog in <c>auth.ai_model_price</c>.</summary>
    DbSet<AiModelPrice> AiModelPrices { get; }

    /// <summary>Append-only metered AI usage ledger in <c>auth.ai_usage_log</c>.</summary>
    DbSet<AiUsageLog> AiUsageLogs { get; }

    /// <summary>TOTP 2FA enrollment records in <c>auth.user_totp</c>.</summary>
    DbSet<UserTotp> UserTotps { get; }

    /// <summary>Single-use password reset tokens in <c>auth.password_reset_token</c>.</summary>
    DbSet<PasswordResetToken> PasswordResetTokens { get; }

    /// <summary>KYC verification records (PAN / Aadhaar) in <c>auth.kyc_verification</c>.</summary>
    DbSet<KycVerification> KycVerifications { get; }

    /// <summary>DPDP Act 2023 — purpose-coded consent audit trail in <c>auth.user_consent</c>.</summary>
    DbSet<UserConsent> UserConsents { get; }

    /// <summary>DPDP Act 2023 — per-user data export (portability) requests in <c>auth.data_export_request</c>.</summary>
    DbSet<DataExportRequest> DataExportRequests { get; }

    /// <summary>DPDP Act 2023 — user-submitted data correction requests in <c>auth.data_correction_request</c>.</summary>
    DbSet<DataCorrectionRequest> DataCorrectionRequests { get; }

    /// <summary>SEC-056 — runtime feature flags in <c>auth.feature_flag</c>.</summary>
    DbSet<FeatureFlag> FeatureFlags { get; }

    /// <summary>SEC-056 — generic key-value platform config (language, WhatsApp) in <c>auth.platform_config</c>.</summary>
    DbSet<PlatformConfig> PlatformConfigs { get; }

    /// <summary>GAP-047: Pending device approval requests in <c>auth.device_approval_requests</c> (migration 083).</summary>
    DbSet<DeviceApprovalRequest> DeviceApprovalRequests { get; }

    /// <summary>GAP-064: Device integrity attestation telemetry in <c>auth.device_integrity_checks</c> (migration 089).</summary>
    DbSet<DeviceIntegrityCheck> DeviceIntegrityChecks { get; }

    /// <summary>Persists changes to the auth schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
