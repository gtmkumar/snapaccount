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
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("auth");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AuthDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
