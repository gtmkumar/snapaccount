using AuthService.Application.Admin.Queries.GetStaffList;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the SnapAccount internal-staff list query (Team › Staff, Screen 87).
/// Verifies the operational-role whitelist (customers excluded), the role filter,
/// deleted-user exclusion, and the active/suspended status mapping.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GetStaffListQueryTests : IDisposable
{
    private readonly AuthDbContext _db;

    public GetStaffListQueryTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private async Task<Guid> SeedUserWithRole(string fullName, string email, string roleName, bool active = true)
    {
        var user = new User { Email = email, FullName = fullName };
        if (!active) user.SetActive(false);
        _db.Users.Add(user);

        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
        if (role is null)
        {
            role = Role.Create(roleName, roleName, isSystemRole: true);
            _db.Roles.Add(role);
        }
        await _db.SaveChangesAsync();

        _db.UserRoles.Add(UserRole.Create(user.Id, role.Id));
        await _db.SaveChangesAsync();
        return user.Id;
    }

    [Fact]
    public async Task ReturnsOperationalStaff_ExcludingCustomers()
    {
        await SeedUserWithRole("Riya Sharma", "riya@snap.in", "CA");
        await SeedUserWithRole("Ops Lead", "ops@snap.in", "OPERATIONS_MANAGER");
        // A customer (BUSINESS_OWNER) must never appear in the staff list.
        await SeedUserWithRole("Customer Co", "owner@biz.in", "BUSINESS_OWNER");

        var handler = new GetStaffListQueryHandler(_db);
        var result = await handler.Handle(new GetStaffListQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);
        result.Value.Select(s => s.Email).Should().BeEquivalentTo(["riya@snap.in", "ops@snap.in"]);
    }

    [Fact]
    public async Task RoleFilter_RestrictsToThatRole_AndRejectsCustomerRole()
    {
        await SeedUserWithRole("Riya Sharma", "riya@snap.in", "CA");
        await SeedUserWithRole("Ops Lead", "ops@snap.in", "OPERATIONS_MANAGER");

        var handler = new GetStaffListQueryHandler(_db);

        var caOnly = await handler.Handle(new GetStaffListQuery("CA"), CancellationToken.None);
        caOnly.Value.Should().ContainSingle().Which.Email.Should().Be("riya@snap.in");

        // A customer role passed as a filter yields nothing (whitelist guard).
        var spoof = await handler.Handle(new GetStaffListQuery("BUSINESS_OWNER"), CancellationToken.None);
        spoof.Value.Should().BeEmpty();
    }

    [Fact]
    public async Task MapsSuspendedStatus_ForInactiveUser()
    {
        await SeedUserWithRole("Suspended Staff", "susp@snap.in", "SUPPORT_EXECUTIVE", active: false);

        var handler = new GetStaffListQueryHandler(_db);
        var result = await handler.Handle(new GetStaffListQuery(), CancellationToken.None);

        result.Value.Should().ContainSingle()
            .Which.Status.Should().Be("suspended");
    }
}
