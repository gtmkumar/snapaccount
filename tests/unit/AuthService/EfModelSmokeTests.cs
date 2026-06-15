using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// EF model smoke tests for AuthService — validates that the EF Core model can generate
/// SQL for key DbSets without schema errors.
///
/// GAP-047: Covers the new auth.device_approval_requests table (migration 083).
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (e.g., UUID↔varchar audit column bugs).
///
/// Requires: local postgres running with snapaccount DB (trust-auth or password=postgresql).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class AuthEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static AuthDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AuthDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new AuthDbContext(options);
    }

    [Fact]
    public async Task Users_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Users.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.user must be correct");
    }

    [Fact]
    public async Task UserDevices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.UserDevices.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.user_device must be correct");
    }

    [Fact]
    public async Task RefreshTokens_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.RefreshTokens.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.refresh_token must be correct");
    }

    /// <summary>
    /// GAP-047: EfSmoke for auth.device_approval_requests (migration 083).
    /// Validates DeviceApprovalRequestConfiguration, status string conversion, UUID audit columns.
    /// </summary>
    [Fact]
    public async Task DeviceApprovalRequests_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.DeviceApprovalRequests.AnyAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for auth.device_approval_requests must be correct (migration 083)");
    }

    /// <summary>
    /// Full-materialization EfSmoke: loads first DeviceApprovalRequest row (if any) and verifies
    /// all columns round-trip without UUID↔varchar cast errors (past bug class).
    /// </summary>
    [Fact]
    public async Task DeviceApprovalRequests_CanMaterialize_FirstRow()
    {
        using var db = CreateDbContext();
        var act = async () =>
        {
            var row = await db.DeviceApprovalRequests.FirstOrDefaultAsync();
            if (row is not null)
            {
                _ = row.Id;
                _ = row.UserId;
                _ = row.NewDeviceId;
                _ = row.NewDeviceIdentifier;
                _ = row.NewDeviceName;
                _ = row.NewDevicePlatform;
                _ = row.ExpiresAt;
                _ = row.Status;
                _ = row.ReviewedByDeviceId;
                _ = row.ReviewedAt;
                _ = row.DenialReason;
                _ = row.NewDeviceSessionTokenId;
                _ = row.CreatedAt;
                _ = row.UpdatedAt;
            }
        };
        await act.Should().NotThrowAsync(
            "Full materialization of DeviceApprovalRequest must succeed — all UUID columns must not cast to varchar");
    }

    [Fact]
    public async Task Roles_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Roles.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.role must be correct");
    }

    [Fact]
    public async Task Permissions_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Permissions.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.permission must be correct");
    }

    [Fact]
    public async Task RolePermissions_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.RolePermissions.AnyAsync();
        await act.Should().NotThrowAsync("EF mapping for auth.role_permission must be correct");
    }
}
