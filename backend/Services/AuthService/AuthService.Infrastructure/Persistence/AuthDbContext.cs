using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace AuthService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>auth</c> schema.
/// Implements <see cref="IAuthDbContext"/> so query handlers can project directly
/// via LINQ without loading full aggregates (Jason Taylor pattern).
/// Audit stamping and domain event dispatch are handled by the registered
/// <c>ISaveChangesInterceptor</c> instances — not overridden here.
/// </summary>
public class AuthDbContext(DbContextOptions<AuthDbContext> options)
    : BaseDbContext(options), IAuthDbContext
{
    /// <inheritdoc />
    public DbSet<User> Users => Set<User>();

    /// <inheritdoc />
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();

    /// <inheritdoc />
    public DbSet<Organization> Organizations => Set<Organization>();

    /// <inheritdoc />
    public DbSet<OrganizationMember> OrganizationMembers => Set<OrganizationMember>();

    /// <inheritdoc />
    public DbSet<Role> Roles => Set<Role>();

    /// <inheritdoc />
    public DbSet<Permission> Permissions => Set<Permission>();

    /// <inheritdoc />
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

    /// <inheritdoc />
    public DbSet<UserRole> UserRoles => Set<UserRole>();

    /// <inheritdoc />
    public DbSet<UserDevice> UserDevices => Set<UserDevice>();

    /// <inheritdoc />
    public DbSet<OtpRequest> OtpRequests => Set<OtpRequest>();

    /// <inheritdoc />
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    /// <inheritdoc />
    public DbSet<UserPreference> UserPreferences => Set<UserPreference>();

    /// <inheritdoc />
    public DbSet<Invitation> Invitations => Set<Invitation>();

    /// <inheritdoc />
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();

    /// <inheritdoc />
    public DbSet<NavigationItem> NavigationItems => Set<NavigationItem>();

    /// <inheritdoc />
    public DbSet<MenuPermission> MenuPermissions => Set<MenuPermission>();

    /// <inheritdoc />
    public DbSet<ResourceType> ResourceTypes => Set<ResourceType>();

    /// <inheritdoc />
    public DbSet<ActionType> ActionTypes => Set<ActionType>();

    /// <inheritdoc />
    public DbSet<ReferenceData> ReferenceData => Set<ReferenceData>();

    /// <inheritdoc />
    public DbSet<AuditLogEntry> AuditEvents => Set<AuditLogEntry>();

    public DbSet<AiConfiguration> AiConfigurations => Set<AiConfiguration>();

    public DbSet<AiProviderKey> AiProviderKeys => Set<AiProviderKey>();

    public DbSet<AiModelPrice> AiModelPrices => Set<AiModelPrice>();

    public DbSet<AiUsageLog> AiUsageLogs => Set<AiUsageLog>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("auth");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AuthDbContext).Assembly);
        // AuditLogEntry lives in shared.audit_log — exclude it from EF migrations.
        // The shared.audit_log table is owned by migration 012 (partitioned by month).
        modelBuilder.Entity<AuditLogEntry>().ToTable(
            t => t.ExcludeFromMigrations());
        base.OnModelCreating(modelBuilder);
    }
}
