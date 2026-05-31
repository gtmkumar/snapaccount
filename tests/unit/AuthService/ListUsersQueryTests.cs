using AuthService.Application.Admin.Queries.ListUsers;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the admin Users (CUSTOMER) list query (Screen 84).
///
/// Locks in the POSITIVE customer definition: a customer is a user with NO active
/// platform user_role AND who is a genuine product end-user — either they own an
/// organisation (business owner) or carry a customer profile type (BUSINESS_OWNER /
/// EMPLOYEE). Guards the regression where operator org-members (e.g. an org admin or
/// DEV_LIMITED_MANAGER holding neither a platform role nor any customer signal) leaked
/// into the customer list.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ListUsersQueryTests : IDisposable
{
    private readonly AuthDbContext _db;

    public ListUsersQueryTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    private User AddUser(string fullName, string email)
    {
        var user = new User { Email = email, FullName = fullName };
        _db.Users.Add(user);
        return user;
    }

    private async Task<Guid> EnsureRole(string roleName)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
        if (role is null)
        {
            role = Role.Create(roleName, roleName, isSystemRole: true);
            _db.Roles.Add(role);
            await _db.SaveChangesAsync();
        }
        return role.Id;
    }

    [Fact]
    public async Task ReturnsBusinessOwnersAndEmployees_ExcludesStaffAndOrgMemberOnly()
    {
        // (1) Business owner — owns an org, no platform role → CUSTOMER.
        var owner = AddUser("Owner Co", "owner@biz.in");
        // (2) Employee — customer profile type, no platform role → CUSTOMER.
        var employee = AddUser("Emp Person", "emp@biz.in");
        // (3) Internal staff — holds a platform user_role → NOT a customer.
        var staff = AddUser("Riya CA", "riya@snap.in");
        // (4) Org-member-only — no platform role, owns nothing, no customer profile
        //     (the Dev Manager leak) → NOT a customer.
        var orgMemberOnly = AddUser("Dev Manager", "manager@snapaccount.local");
        await _db.SaveChangesAsync();

        // Org owned by the business owner.
        _db.Organizations.Add(new Organization
        {
            OwnerUserId = owner.Id,
            BusinessName = "Owner Co Pvt Ltd",
        });

        // Profiles: employee is a customer type; staff is STAFF.
        var empProfile = new UserProfile { UserId = employee.Id };
        empProfile.SetUserType("EMPLOYEE");
        var staffProfile = new UserProfile { UserId = staff.Id };
        staffProfile.SetUserType("STAFF");
        _db.UserProfiles.AddRange(empProfile, staffProfile);
        await _db.SaveChangesAsync();

        // Staff platform role.
        var caRoleId = await EnsureRole("CA");
        _db.UserRoles.Add(UserRole.Create(staff.Id, caRoleId));

        // The org-member-only user belongs to the business owner's org with an org role,
        // but has NO platform user_role, no owned org, and no customer profile.
        var orgRoleId = await EnsureRole("DEV_LIMITED_MANAGER");
        var someOrg = await _db.Organizations.FirstAsync();
        _db.OrganizationMembers.Add(OrganizationMember.Create(someOrg.Id, orgMemberOnly.Id, orgRoleId));
        await _db.SaveChangesAsync();

        var handler = new ListUsersQueryHandler(_db);
        var result = await handler.Handle(new ListUsersQuery(Page: 1, PageSize: 50), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Select(i => i.Email)
            .Should().BeEquivalentTo(["owner@biz.in", "emp@biz.in"],
                "only the business owner and the employee are real customers; internal staff and org-member-only users are excluded");
        result.Value.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task UserTypeFilter_BusinessOwner_ReturnsOnlyThatType()
    {
        var owner = AddUser("Owner Co", "owner@biz.in");
        var employee = AddUser("Emp Person", "emp@biz.in");
        await _db.SaveChangesAsync();

        _db.Organizations.Add(new Organization
        {
            OwnerUserId = owner.Id,
            BusinessName = "Owner Co Pvt Ltd",
        });
        var ownerProfile = new UserProfile { UserId = owner.Id };
        ownerProfile.SetUserType("BUSINESS_OWNER");
        var empProfile = new UserProfile { UserId = employee.Id };
        empProfile.SetUserType("EMPLOYEE");
        _db.UserProfiles.AddRange(ownerProfile, empProfile);
        await _db.SaveChangesAsync();

        var handler = new ListUsersQueryHandler(_db);
        var result = await handler.Handle(
            new ListUsersQuery(Page: 1, PageSize: 50, UserType: "BUSINESS_OWNER"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().ContainSingle()
            .Which.Email.Should().Be("owner@biz.in");
    }
}
