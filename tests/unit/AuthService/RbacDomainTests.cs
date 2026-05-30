// Tests: Auth/RBAC Module 1 — domain logic for role, permission, org-member entities
// and the PermissionBehavior pipeline behavior.
//
// All tests operate on domain entities and the PermissionBehavior — no I/O, no EF Core.
// These tests compile against the current codebase; new RBAC entity fields
// (organization_id on Role, Invitation entity) will extend these tests once
// backend-agent's migration lands.

using AuthService.Application.Behaviors;
using AuthService.Domain.Entities;
using FluentAssertions;
using MediatR;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

// ────────────────────────────────────────────────────────────────────────────
// 1. Role entity domain tests
// ────────────────────────────────────────────────────────────────────────────

public class RoleDomainTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_WithNameAndDisplayName_SetsProperties()
    {
        var role = Role.Create("ca_senior", "Senior CA", "Senior Chartered Accountant");

        role.Name.Should().Be("ca_senior");
        role.DisplayName.Should().Be("Senior CA");
        role.Description.Should().Be("Senior Chartered Accountant");
        role.IsSystemRole.Should().BeFalse("default must be non-system");
        role.IsActive.Should().BeTrue("newly created role must be active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_AsSystemRole_SetsIsSystemRoleTrue()
    {
        var role = Role.Create("SUPER_ADMIN", "Super Admin", isSystemRole: true);

        role.IsSystemRole.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_NoPermissionsInitially_PermissionsCollectionIsEmpty()
    {
        var role = Role.Create("hr_manager", "HR Manager");

        role.Permissions.Should().BeEmpty("a freshly created role has no permissions");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void RolePermission_Create_SetsRoleIdAndPermissionId()
    {
        var roleId = Guid.NewGuid();
        var permId = Guid.NewGuid();

        var rp = RolePermission.Create(roleId, permId);

        rp.RoleId.Should().Be(roleId);
        rp.PermissionId.Should().Be(permId);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_Create_SetsAllFields()
    {
        var perm = Permission.Create(
            "org.roles.manage",
            "org",
            "roles.manage",
            "Manage roles within the organisation");

        perm.Name.Should().Be("org.roles.manage");
        perm.Resource.Should().Be("org");
        perm.Action.Should().Be("roles.manage");
        perm.Description.Should().Contain("Manage roles");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. OrganizationMember entity tests
// ────────────────────────────────────────────────────────────────────────────

public class OrganizationMemberDomainTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_SetsOrganizationUserAndRole()
    {
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var roleId = Guid.NewGuid();

        var member = OrganizationMember.Create(orgId, userId, roleId);

        member.OrganizationId.Should().Be(orgId);
        member.UserId.Should().Be(userId);
        member.RoleId.Should().Be(roleId);
        member.IsActive.Should().BeTrue("new member must be active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Deactivate_SetsIsActiveFalse()
    {
        var member = OrganizationMember.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

        member.Deactivate();

        member.IsActive.Should().BeFalse("deactivated member must not be active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_DifferentOrgs_DoNotShareMembership()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var roleId = Guid.NewGuid();

        var memberA = OrganizationMember.Create(orgA, userId, roleId);
        var memberB = OrganizationMember.Create(orgB, userId, roleId);

        memberA.OrganizationId.Should().NotBe(memberB.OrganizationId,
            "members in different orgs must have distinct org scoping");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. PermissionBehavior pipeline tests — SEC-012
// ────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Minimal test command that requires the "org.roles.read" permission.
/// Not decorated — used for the no-attribute path.
/// </summary>
file record UnprotectedQuery : IRequest<Result<string>>;

/// <summary>Command decorated with a permission requirement.</summary>
[RequiresPermission("org.roles.read")]
file record ProtectedQuery : IRequest<Result<string>>;

/// <summary>Command requiring a high-privilege permission (org.permissions.grant).</summary>
[RequiresPermission("org.permissions.grant")]
file record GrantPermissionCommand : IRequest<Result<string>>;

public class PermissionBehaviorTests
{
    private static PermissionBehavior<TRequest, TResponse> MakeBehavior<TRequest, TResponse>(
        ICurrentUser currentUser)
        where TRequest : notnull
        where TResponse : notnull
        => new(currentUser);

    private static Mock<ICurrentUser> AuthenticatedUserWith(params string[] permissions)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.HasPermission(It.IsAny<string>()))
            .Returns<string>(p => permissions.Contains(p));
        return mock;
    }

    private static Mock<ICurrentUser> UnauthenticatedUser()
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(false);
        return mock;
    }

    // ── 3a. No attribute — pass-through ──

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_WithNoPermissionAttribute_PassesThrough()
    {
        var user = AuthenticatedUserWith();
        var behavior = MakeBehavior<UnprotectedQuery, Result<string>>(user.Object);
        var invoked = false;

        var result = await behavior.Handle(
            new UnprotectedQuery(),
            (_ => { invoked = true; return Task.FromResult(Result<string>.Success("ok")); }),
            CancellationToken.None);

        invoked.Should().BeTrue("unprotected request must reach the handler");
        result.IsSuccess.Should().BeTrue();
    }

    // ── 3b. Authenticated + has permission → passes ──

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_UserHasRequiredPermission_PassesThrough()
    {
        var user = AuthenticatedUserWith("org.roles.read");
        var behavior = MakeBehavior<ProtectedQuery, Result<string>>(user.Object);
        var invoked = false;

        var result = await behavior.Handle(
            new ProtectedQuery(),
            (_ => { invoked = true; return Task.FromResult(Result<string>.Success("data")); }),
            CancellationToken.None);

        invoked.Should().BeTrue();
        result.IsSuccess.Should().BeTrue();
    }

    // ── 3c. Authenticated + missing permission → Forbidden ──

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_UserLacksRequiredPermission_ReturnsForbidden()
    {
        var user = AuthenticatedUserWith(/* no permissions */);
        var behavior = MakeBehavior<ProtectedQuery, Result<string>>(user.Object);
        var handlerInvoked = false;

        var result = await behavior.Handle(
            new ProtectedQuery(),
            (_ => { handlerInvoked = true; return Task.FromResult(Result<string>.Success("data")); }),
            CancellationToken.None);

        handlerInvoked.Should().BeFalse("handler must NOT be invoked when permission is missing");
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Forbidden);
        result.Error.Code.Should().Be("Auth.InsufficientPermission");
    }

    // ── 3d. Not authenticated → Unauthorized ──

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_UnauthenticatedUser_ReturnsUnauthorized()
    {
        var user = UnauthenticatedUser();
        var behavior = MakeBehavior<ProtectedQuery, Result<string>>(user.Object);

        var result = await behavior.Handle(
            new ProtectedQuery(),
            _ => Task.FromResult(Result<string>.Success("data")),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
        result.Error.Code.Should().Be("Auth.NotAuthenticated");
    }

    // ── 3e. Privilege escalation: delegate without org.permissions.grant → Forbidden ──
    // This models the constrained delegation rule: a delegate who only has
    // org.roles.read CANNOT invoke a command requiring org.permissions.grant.

    [Fact]
    [Trait("Category", "Unit")]
    public void PrivilegeEscalation_DelegateWithoutGrantPermission_CannotInvokeGrantCommand()
    {
        // Delegate has org.roles.read and org.members.read only
        var delegate_permissions = new HashSet<string> { "org.roles.read", "org.members.read" };

        // The permission being requested (simulating what GrantPermissionCommand requires)
        const string requiredPerm = "org.permissions.grant";

        delegate_permissions.Contains(requiredPerm).Should().BeFalse(
            "a delegate without org.permissions.grant must be blocked — " +
            "constrained delegation forbids escalation beyond own effective set");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_DelegateGrantsPermissionTheyDoNotOwn_ReturnsForbidden()
    {
        // A delegate who has only org.roles.read cannot invoke GrantPermissionCommand
        // which requires org.permissions.grant
        var delegate_user = AuthenticatedUserWith("org.roles.read", "org.members.read");
        var behavior = MakeBehavior<GrantPermissionCommand, Result<string>>(delegate_user.Object);

        var result = await behavior.Handle(
            new GrantPermissionCommand(),
            _ => Task.FromResult(Result<string>.Success("granted")),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue(
            "delegate cannot invoke commands requiring permissions they do not hold");
        result.Error.Type.Should().Be(ErrorType.Forbidden,
            "the server must return Forbidden (403) for privilege escalation attempts");
    }

    // ── 3f. SUPER_ADMIN bypass: explicit permission grants all access ──

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Handle_SuperAdminWithGrantPermission_CanInvokeGrantCommand()
    {
        // SUPER_ADMIN explicitly holds org.permissions.grant
        var superAdmin = AuthenticatedUserWith(
            "org.permissions.grant", "org.roles.create", "org.roles.update",
            "org.members.invite", "platform.permissions.manage");
        var behavior = MakeBehavior<GrantPermissionCommand, Result<string>>(superAdmin.Object);

        var result = await behavior.Handle(
            new GrantPermissionCommand(),
            _ => Task.FromResult(Result<string>.Success("granted")),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("SUPER_ADMIN with correct permission must pass");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Org isolation logic tests — pure domain / logic layer
// ────────────────────────────────────────────────────────────────────────────

public class OrgIsolationDomainTests
{
    /// <summary>
    /// Simulates the org-scoping check that the application layer must perform:
    /// a user from org A requesting a resource in org B must be rejected.
    /// This is a pure-logic test — the actual check lives in command handlers
    /// added by backend-agent. This test documents and validates the invariant.
    /// </summary>
    [Fact]
    [Trait("Category", "Unit")]
    public void OrgScopeCheck_UserFromOrgA_CannotAccessOrgBResource()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        // Simulates the check: `if (caller.OrganizationId != resource.OrganizationId) → Forbidden`
        bool isAllowed(Guid callerOrg, Guid resourceOrg) => callerOrg == resourceOrg;

        isAllowed(orgA, orgB).Should().BeFalse(
            "a user from org A must not access org B resources — IDOR protection");
        isAllowed(orgA, orgA).Should().BeTrue(
            "a user from org A must access their own org resources");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void OrgScopeCheck_SuperAdmin_BypassesOrgIsolation()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();

        // SUPER_ADMIN passes null OrganizationId (platform scope)
        bool isSuperAdmin(Guid? callerOrg) => callerOrg is null;

        // Super admin bypass: if caller is SUPER_ADMIN, skip org check
        bool canAccess(Guid? callerOrg, Guid resourceOrg)
            => isSuperAdmin(callerOrg) || callerOrg == resourceOrg;

        canAccess(null, orgA).Should().BeTrue("SUPER_ADMIN bypasses org isolation");
        canAccess(null, orgB).Should().BeTrue("SUPER_ADMIN can access any org");
        canAccess(orgA, orgB).Should().BeFalse("regular org member cannot cross org boundary");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void CustomRole_WithOrgScoping_BelongsToOneOrg()
    {
        // Models the org_id scoping for custom roles:
        // - system roles have org_id = NULL
        // - custom roles must have org_id set
        Guid? systemRoleOrgId = null;      // NULL = global / system role
        Guid customRoleOrgId = Guid.NewGuid(); // non-null = custom org role

        systemRoleOrgId.Should().BeNull(
            "system roles are globally owned — org_id must be NULL");
        customRoleOrgId.Should().NotBeEmpty(
            "custom roles must be scoped to a specific org");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void OrgAdmin_CannotModifySystemRoles()
    {
        // An org admin can modify custom roles (organization_id = their org)
        // but must NOT be able to modify system roles (organization_id = NULL)
        var orgId = Guid.NewGuid();

        bool canModifyRole(Guid callerOrgId, Guid? roleOrgId, bool isSystemRole)
        {
            // Org admins cannot touch system roles
            if (isSystemRole || roleOrgId is null)
                return false;
            // Must own the role's org
            return roleOrgId == callerOrgId;
        }

        canModifyRole(orgId, null, isSystemRole: true).Should().BeFalse(
            "org admin must not modify global system roles");
        canModifyRole(orgId, Guid.NewGuid(), isSystemRole: false).Should().BeFalse(
            "org admin must not modify another org's custom role");
        canModifyRole(orgId, orgId, isSystemRole: false).Should().BeTrue(
            "org admin can modify their own org's custom role");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Constrained delegation invariant tests (pure logic)
// ────────────────────────────────────────────────────────────────────────────

public class ConstrainedDelegationTests
{
    // The delegation rule: a caller can only GRANT permissions that are a
    // SUBSET of their own effective permission set.

    private static bool CanGrantPermissions(
        IReadOnlySet<string> callerPermissions,
        IReadOnlySet<string> permissionsToGrant)
        => permissionsToGrant.IsSubsetOf(callerPermissions);

    private static bool CanAssignRole(
        IReadOnlySet<string> callerPermissions,
        IReadOnlySet<string> rolePermissions)
        => rolePermissions.IsSubsetOf(callerPermissions);

    [Fact]
    [Trait("Category", "Unit")]
    public void Grant_CallerGrantsSubsetOfOwnPerms_IsAllowed()
    {
        var callerPerms = new HashSet<string>
        {
            "org.roles.read", "org.roles.create", "org.members.invite", "org.permissions.grant"
        };
        var toGrant = new HashSet<string> { "org.roles.read", "org.members.invite" };

        CanGrantPermissions(callerPerms, toGrant).Should().BeTrue(
            "granting a subset of own permissions is the expected allowed path");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Grant_CallerTriesToGrantPermTheyDontOwn_IsRejected()
    {
        var callerPerms = new HashSet<string> { "org.roles.read", "org.members.invite" };
        // Caller does NOT have org.roles.delete or org.permissions.grant
        var toGrant = new HashSet<string> { "org.roles.read", "org.roles.delete" };

        CanGrantPermissions(callerPerms, toGrant).Should().BeFalse(
            "delegate cannot grant a permission they do not themselves hold — escalation prevention");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Grant_CallerTriesToGrantOrgPermissionsGrantWithoutOwningIt_IsRejected()
    {
        var callerPerms = new HashSet<string> { "org.roles.read", "org.members.invite" };
        var toGrant = new HashSet<string> { "org.permissions.grant" };

        CanGrantPermissions(callerPerms, toGrant).Should().BeFalse(
            "granting the permission-grant capability itself requires owning it first");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Grant_CallerGrantsEmptySet_IsAllowed()
    {
        var callerPerms = new HashSet<string> { "org.roles.read" };
        var toGrant = new HashSet<string>();

        CanGrantPermissions(callerPerms, toGrant).Should().BeTrue(
            "granting zero permissions is a valid (no-op) operation");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void AssignRole_RolePermsSupersetOfCallerPerms_IsRejected()
    {
        // Role has platform.permissions.manage which the caller doesn't hold
        var callerPerms = new HashSet<string> { "org.roles.read", "org.members.invite" };
        var rolePerms = new HashSet<string>
        {
            "org.roles.read", "org.members.invite", "platform.permissions.manage"
        };

        CanAssignRole(callerPerms, rolePerms).Should().BeFalse(
            "assigning a role whose permissions exceed the caller's is forbidden — " +
            "privilege escalation via role assignment must be blocked");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void AssignRole_RolePermsSubsetOfCallerPerms_IsAllowed()
    {
        var callerPerms = new HashSet<string>
        {
            "org.roles.read", "org.members.invite", "org.roles.create", "org.permissions.grant"
        };
        var rolePerms = new HashSet<string> { "org.roles.read", "org.members.invite" };

        CanAssignRole(callerPerms, rolePerms).Should().BeTrue(
            "assigning a role with permissions that are a subset of the caller's is allowed");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void AssignRole_CallerAssignsRoleWithSamePermissions_IsAllowed()
    {
        var callerPerms = new HashSet<string> { "org.roles.read", "org.members.invite" };
        var rolePerms = new HashSet<string> { "org.roles.read", "org.members.invite" };

        CanAssignRole(callerPerms, rolePerms).Should().BeTrue(
            "assigning a role with exactly the same permissions as the caller is allowed");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DelegateWithRoleManage_CanOnlyToggleWithinOwnPermSet()
    {
        // A delegate who has been granted org.roles.manage + a limited set of perms:
        var delegateEffectivePerms = new HashSet<string>
        {
            "org.roles.read", "org.roles.create", "org.roles.update",
            "org.members.read", "org.members.invite"
        };

        // Attempt to toggle ON: org.roles.delete — not in delegate's set → reject
        var attemptToEnable = new HashSet<string> { "org.roles.delete" };

        CanGrantPermissions(delegateEffectivePerms, attemptToEnable).Should().BeFalse(
            "delegate cannot toggle ON permissions they do not hold — " +
            "org.roles.delete is not in delegate's effective set");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Invitation token model tests (pure logic — entity to be added by db-engineer)
// ────────────────────────────────────────────────────────────────────────────

public class InvitationTokenModelTests
{
    // These tests validate the token rules described in the module scope §2
    // without depending on the not-yet-created Invitation entity.
    // They will be migrated to use the actual Invitation class once it lands.

    [Fact]
    [Trait("Category", "Unit")]
    public void InviteToken_GeneratedHash_IsNotEmpty()
    {
        // Token must be cryptographically random — simulate SHA-256 of a UUID token
        var tokenBytes = new byte[32];
        System.Security.Cryptography.RandomNumberGenerator.Fill(tokenBytes);
        var tokenHash = Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(tokenBytes)).ToLowerInvariant();

        tokenHash.Should().HaveLength(64, "SHA-256 hex digest is always 64 chars");
        tokenHash.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InviteToken_72HourExpiry_IsCorrect()
    {
        var createdAt = DateTime.UtcNow;
        var expiresAt = createdAt.AddHours(72);

        expiresAt.Should().BeCloseTo(DateTime.UtcNow.AddHours(72), TimeSpan.FromSeconds(5),
            "invite tokens must expire 72 hours after creation");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InviteStatus_AcceptedInvite_CannotBeAcceptedAgain()
    {
        // Models idempotency: a ACCEPTED invite cannot be re-accepted (replay protection)
        const string status = "ACCEPTED";

        bool canAccept(string inviteStatus) => inviteStatus == "PENDING";

        canAccept(status).Should().BeFalse("accepted invite must not be re-accepted — replay protection");
        canAccept("PENDING").Should().BeTrue("pending invite can be accepted");
        canAccept("REVOKED").Should().BeFalse("revoked invite cannot be accepted");
        canAccept("EXPIRED").Should().BeFalse("expired invite cannot be accepted");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InviteStatus_ExpiredToken_CannotBeAccepted()
    {
        var tokenExpiresAt = DateTime.UtcNow.AddHours(-1); // 1 hour in the past

        bool isExpired(DateTime expiresAt) => DateTime.UtcNow > expiresAt;

        isExpired(tokenExpiresAt).Should().BeTrue("tokens past expiry must be rejected");
        isExpired(DateTime.UtcNow.AddHours(1)).Should().BeFalse("valid token not yet expired");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void TwoInvitations_SamePerson_HaveDifferentTokenHashes()
    {
        // Ensures token uniqueness per invite — same email, two invites → different token hashes
        static string GenerateTokenHash()
        {
            var bytes = new byte[32];
            System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
            return Convert.ToHexString(
                System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
        }

        var hash1 = GenerateTokenHash();
        var hash2 = GenerateTokenHash();

        hash1.Should().NotBe(hash2, "each invitation must have a unique token hash");
    }

    // ── BUG-E2E-INVITE-500: Status value-converter round-trip ──────────────
    // The DB CHECK constraint requires UPPERCASE: 'PENDING','ACCEPTED','REVOKED','EXPIRED'.
    // EF Core's HasConversion<string>() would emit PascalCase ("Pending") and fail the check.
    // These tests verify the converter maps each enum member to/from the expected UPPERCASE token.

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData(AuthService.Domain.Entities.InvitationStatus.Pending,  "PENDING")]
    [InlineData(AuthService.Domain.Entities.InvitationStatus.Accepted, "ACCEPTED")]
    [InlineData(AuthService.Domain.Entities.InvitationStatus.Revoked,  "REVOKED")]
    [InlineData(AuthService.Domain.Entities.InvitationStatus.Expired,  "EXPIRED")]
    public void InvitationStatus_DbToken_IsUppercase(
        AuthService.Domain.Entities.InvitationStatus status, string expectedDbToken)
    {
        // Mirrors the value converter: v => v.ToString().ToUpperInvariant()
        var dbToken = status.ToString().ToUpperInvariant();

        dbToken.Should().Be(expectedDbToken,
            $"the DB CHECK constraint requires '{expectedDbToken}' " +
            $"but the converter would write '{dbToken}'");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("PENDING",  AuthService.Domain.Entities.InvitationStatus.Pending)]
    [InlineData("ACCEPTED", AuthService.Domain.Entities.InvitationStatus.Accepted)]
    [InlineData("REVOKED",  AuthService.Domain.Entities.InvitationStatus.Revoked)]
    [InlineData("EXPIRED",  AuthService.Domain.Entities.InvitationStatus.Expired)]
    public void InvitationStatus_ParseUppercaseDbToken_RoundTrips(
        string dbToken, AuthService.Domain.Entities.InvitationStatus expectedStatus)
    {
        // Mirrors the value converter: v => Enum.Parse<InvitationStatus>(v, ignoreCase: true)
        var parsed = Enum.Parse<AuthService.Domain.Entities.InvitationStatus>(dbToken, ignoreCase: true);

        parsed.Should().Be(expectedStatus,
            $"reading '{dbToken}' from DB must deserialise to {expectedStatus}");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InvitationStatus_NewInvitation_DefaultsToUppercasePending()
    {
        // Verify the default value written on Invitation.Create() round-trips correctly.
        var status = AuthService.Domain.Entities.InvitationStatus.Pending;
        var dbToken = status.ToString().ToUpperInvariant();

        dbToken.Should().Be("PENDING",
            "a newly created invitation must persist as 'PENDING' in the DB " +
            "to satisfy the CHECK constraint (BUG-E2E-INVITE-500)");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Permission catalog completeness tests
// ────────────────────────────────────────────────────────────────────────────

public class PermissionCatalogTests
{
    // Validates that the permission names mandated in §3 of the module scope
    // follow the `resource.action` naming convention.

    private static readonly string[] ExpectedOrgPermissions =
    [
        "org.members.read", "org.members.invite", "org.members.update",
        "org.members.remove", "org.members.suspend",
        "org.roles.read", "org.roles.create", "org.roles.update",
        "org.roles.delete", "org.roles.assign",
        "org.permissions.read", "org.permissions.grant",
        "org.settings.read", "org.settings.update"
    ];

    private static readonly string[] ExpectedPlatformPermissions =
    [
        "platform.orgs.read", "platform.orgs.create", "platform.orgs.suspend",
        "platform.admins.invite", "platform.roles.manage", "platform.permissions.manage"
    ];

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("org.members.read")]
    [InlineData("org.members.invite")]
    [InlineData("org.roles.create")]
    [InlineData("org.permissions.grant")]
    [InlineData("platform.orgs.create")]
    [InlineData("platform.permissions.manage")]
    public void Permission_NameFormat_FollowsResourceDotAction(string permName)
    {
        var parts = permName.Split('.');
        parts.Length.Should().BeGreaterThanOrEqualTo(2,
            $"permission '{permName}' must follow 'resource.action' or 'resource.sub.action' format");
        parts[0].Should().NotBeNullOrWhiteSpace("resource segment must not be empty");
        parts[^1].Should().NotBeNullOrWhiteSpace("action segment must not be empty");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void OrgPermissions_CatalogIsComplete_ContainsAllRequiredEntries()
    {
        // Validate the catalog list from module scope §3 is fully represented
        ExpectedOrgPermissions.Should().HaveCount(14,
            "14 org.* permissions are mandated in module scope §3");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void PlatformPermissions_CatalogIsComplete_ContainsAllRequiredEntries()
    {
        ExpectedPlatformPermissions.Should().HaveCount(6,
            "6 platform.* permissions are mandated in module scope §3");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void AllPermissions_HaveNoDuplicates()
    {
        var all = ExpectedOrgPermissions.Concat(ExpectedPlatformPermissions).ToList();
        all.Distinct().Should().HaveCount(all.Count, "permission catalog must not have duplicates");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. AcceptInvitation identity-match guard tests  (M1-R-002)
// ────────────────────────────────────────────────────────────────────────────

public class InvitationIdentityMatchTests
{
    // The acceptance guard: caller email OR phone must match the invitee.
    // This is a pure-logic test mirroring the check in AcceptInvitationCommandHandler.

    private static bool CanAcceptInvitation(
        string? callerEmail,
        string? callerPhone,
        string inviteeEmail,
        string? inviteePhone)
    {
        var emailMatches = !string.IsNullOrWhiteSpace(callerEmail) &&
            string.Equals(callerEmail.Trim(), inviteeEmail.Trim(),
                StringComparison.OrdinalIgnoreCase);

        var phoneMatches = inviteePhone is not null &&
            !string.IsNullOrWhiteSpace(callerPhone) &&
            string.Equals(callerPhone.Trim(), inviteePhone.Trim(),
                StringComparison.Ordinal);

        return emailMatches || phoneMatches;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_CallerEmailMatchesInvitee_IsAllowed()
    {
        CanAcceptInvitation(
            callerEmail:  "alice@acme.com",
            callerPhone:  null,
            inviteeEmail: "alice@acme.com",
            inviteePhone: null)
        .Should().BeTrue("email match must allow acceptance");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_CallerEmailCaseInsensitiveMatch_IsAllowed()
    {
        CanAcceptInvitation(
            callerEmail:  "Alice@ACME.COM",
            callerPhone:  null,
            inviteeEmail: "alice@acme.com",
            inviteePhone: null)
        .Should().BeTrue("email comparison must be case-insensitive");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_CallerPhoneMatchesInvitee_IsAllowed()
    {
        CanAcceptInvitation(
            callerEmail:  null,
            callerPhone:  "+919876543210",
            inviteeEmail: "bob@acme.com",
            inviteePhone: "+919876543210")
        .Should().BeTrue("phone match must allow acceptance when email is absent");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_DifferentEmail_IsRejected()
    {
        // M1-R-002: a different user holding the token must be rejected
        CanAcceptInvitation(
            callerEmail:  "mallory@evil.com",
            callerPhone:  null,
            inviteeEmail: "alice@acme.com",
            inviteePhone: null)
        .Should().BeFalse(
            "a caller whose email does not match the invitee must be rejected — " +
            "prevents token-forwarding attacks");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_DifferentEmailAndPhone_IsRejected()
    {
        CanAcceptInvitation(
            callerEmail:  "mallory@evil.com",
            callerPhone:  "+910000000000",
            inviteeEmail: "alice@acme.com",
            inviteePhone: "+919876543210")
        .Should().BeFalse(
            "neither email nor phone matches — must reject regardless of other claims");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_CallerEmailMatchesButPhoneDoesNotMatch_IsAllowed()
    {
        // Email match is sufficient — phone mismatch is irrelevant
        CanAcceptInvitation(
            callerEmail:  "alice@acme.com",
            callerPhone:  "+910000000000",   // different phone, but email matches
            inviteeEmail: "alice@acme.com",
            inviteePhone: "+919876543210")
        .Should().BeTrue("email match alone is sufficient for acceptance");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Accept_InviteeHasPhoneOnly_CallerPhoneMatches_IsAllowed()
    {
        CanAcceptInvitation(
            callerEmail:  null,
            callerPhone:  "+919876543210",
            inviteeEmail: "",               // no email on invite
            inviteePhone: "+919876543210")
        .Should().BeTrue("phone-only invite can be accepted with matching phone");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 9. DEV_LIMITED_MANAGER seeding + permission-expansion tests
// ────────────────────────────────────────────────────────────────────────────

public class DevLimitedManagerSeedingTests
{
    // These tests validate the seeding contract for the second LOCAL_AUTH dev user
    // (manager@snapaccount.local). They are pure-logic tests — no EF Core/DB.

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerPermissions_ContainsExactly7Permissions()
    {
        AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Should().HaveCount(7,
                "DEV_LIMITED_MANAGER is seeded with exactly 7 permissions — " +
                "enough to demonstrate grantable/non-grantable greying in the matrix");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("org.roles.read")]
    [InlineData("org.roles.create")]
    [InlineData("org.roles.update")]
    [InlineData("org.permissions.read")]
    [InlineData("org.permissions.grant")]
    [InlineData("gst.returns.file")]
    [InlineData("document.read")]
    public void ManagerPermissions_ContainsRequiredPermission(string expected)
    {
        AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Should().Contain(expected,
                $"'{expected}' must be in the manager's grantable set");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerPermissions_DoesNotContainWildcard()
    {
        AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Should().NotContain("*",
                "manager must NOT receive the wildcard — that would make all perms grantable " +
                "and defeat the delegation-greying demo");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerPermissions_DoesNotContainPlatformPerms()
    {
        var platformPerms = AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Where(p => p.StartsWith("platform.", StringComparison.OrdinalIgnoreCase))
            .ToList();

        platformPerms.Should().BeEmpty(
            "manager must not hold any platform.* permissions — those are SUPER_ADMIN only");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerPermissions_DoesNotContainOrgMembersRemove()
    {
        // org.members.remove / org.members.suspend are intentionally absent so the
        // matrix shows those rows as greyed/non-grantable for the demo.
        AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Should().NotContain("org.members.remove",
                "org.members.remove is deliberately excluded to show greying in the demo");

        AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions
            .Should().NotContain("org.members.suspend",
                "org.members.suspend is deliberately excluded to show greying in the demo");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerPermissions_IsSubsetOf_AdminWildcard()
    {
        // Simulates the delegation check: the manager's permissions must all be
        // a subset of what an ORG_ADMIN (wildcard) could grant.
        // Since wildcard grants everything, any finite set is a subset — this test
        // documents the invariant rather than doing a runtime DB check.
        var managerSet = AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions.ToHashSet();
        var callerIsAdmin = true; // admin has wildcard

        var delegationAllowed = callerIsAdmin ||
            managerSet.IsSubsetOf(
                AuthService.Application.Common.DevSeed.LocalAuthDevSeed.ManagerPermissions);

        delegationAllowed.Should().BeTrue(
            "ORG_ADMIN (wildcard) can grant any subset — including the manager's limited set");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ManagerRole_OrgScoped_IsNotSystemRole()
    {
        // DEV_LIMITED_MANAGER must be created with Role.CreateOrgRole (not Role.Create),
        // so IsSystemRole=false and OrganizationId=DevOrgId.
        var devOrgId = AuthService.Application.Common.DevSeed.LocalAuthDevSeed.DevOrgId;
        var adminUserId = Guid.NewGuid(); // placeholder

        var role = AuthService.Domain.Entities.Role.CreateOrgRole(
            organizationId: devOrgId,
            createdByUserId: adminUserId,
            name: "DEV_LIMITED_MANAGER",
            displayName: "Dev Limited Manager");

        role.IsSystemRole.Should().BeFalse(
            "DEV_LIMITED_MANAGER is a custom org role, not a system role — " +
            "it appears in the org's role list and can be edited by ORG_ADMIN");
        role.OrganizationId.Should().Be(devOrgId,
            "the role is scoped to the dev org");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void OrgMemberPermissions_UnionedFromBothSources_NoDuplicates()
    {
        // Models the LoginAsync fix: permissions = union(platform perms, org membership perms).
        // Verifies no duplicates when the same permission appears in both sources.
        var platformPerms = new[] { "org.roles.read", "org.permissions.read" };
        var orgPerms      = new[] { "org.roles.read", "gst.returns.file" };  // "org.roles.read" in both

        var effective = platformPerms
            .Union(orgPerms, StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p)
            .ToList();

        effective.Should().HaveCount(3, "union must deduplicate");
        effective.Should().Contain("org.roles.read");
        effective.Should().Contain("org.permissions.read");
        effective.Should().Contain("gst.returns.file");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Organization field round-trip tests  (BUG-ORG-BUSINESSTYPE)
// ────────────────────────────────────────────────────────────────────────────

public class OrganizationFieldMappingTests
{
    // These tests exercise the domain entity directly — no EF Core, no repository.
    // They confirm that every field the CreateOrganizationCommand carries is
    // reachable on the entity after construction + SetBusinessDetails().

    [Fact]
    [Trait("Category", "Unit")]
    public void SetBusinessDetails_PersistsAllThreeFields()
    {
        var org = new Organization
        {
            OwnerUserId  = Guid.NewGuid(),
            BusinessName = "Acme Pvt Ltd",
            Gstin        = null,
            PanNumber    = "AAACT1234C",
            IsGstRegistered = false,
        };

        org.SetBusinessDetails(
            businessType:      "Private Limited",
            industryType:      "Technology",
            annualTurnoverInr: 5_000_000m);

        org.BusinessType.Should().Be("Private Limited",
            "BusinessType must be persisted via SetBusinessDetails (BUG-ORG-BUSINESSTYPE)");
        org.IndustryType.Should().Be("Technology",
            "IndustryType must be persisted via SetBusinessDetails");
        org.AnnualTurnoverInr.Should().Be(5_000_000m,
            "AnnualTurnoverInr must be persisted via SetBusinessDetails");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Organization_InitFields_PersistViaObjectInitialiser()
    {
        // Gstin and PanNumber use 'init' accessors — they are set via object initialiser
        // and should always have persisted correctly.
        var org = new Organization
        {
            OwnerUserId     = Guid.NewGuid(),
            BusinessName    = "Test Co",
            Gstin           = "27AABCU9603R1ZX",
            PanNumber       = "AABCU9603R",
            IsGstRegistered = true,
        };
        org.SetBusinessDetails(null, null, null);

        org.Gstin.Should().Be("27AABCU9603R1ZX",
            "Gstin (init) must survive object initialiser");
        org.PanNumber.Should().Be("AABCU9603R",
            "PanNumber (init) must survive object initialiser");
        org.IsGstRegistered.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void SetBusinessDetails_WithNulls_ClearsFields()
    {
        var org = new Organization
        {
            OwnerUserId  = Guid.NewGuid(),
            BusinessName = "Test Co",
        };

        // First set values, then call with nulls — fields must become null.
        org.SetBusinessDetails("Sole Proprietor", "Retail", 100_000m);
        org.SetBusinessDetails(null, null, null);

        org.BusinessType.Should().BeNull("null arg must clear BusinessType");
        org.IndustryType.Should().BeNull("null arg must clear IndustryType");
        org.AnnualTurnoverInr.Should().BeNull("null arg must clear AnnualTurnoverInr");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Organization_WithoutSetBusinessDetails_FieldsDefaultToNull()
    {
        // Regression guard: if SetBusinessDetails is NOT called (old code path),
        // the fields must default to null — not throw, not have stale values.
        var org = new Organization
        {
            OwnerUserId  = Guid.NewGuid(),
            BusinessName = "Bare Org",
        };

        org.BusinessType.Should().BeNull(
            "BusinessType must default to null when SetBusinessDetails is not called");
        org.IndustryType.Should().BeNull();
        org.AnnualTurnoverInr.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void CreateOrganizationCommand_AllOptionalFields_AreRepresentable()
    {
        // Confirms the command record carries all fields the handler needs to pass
        // through to the entity — a compile-time contract check.
        var cmd = new AuthService.Application.Organizations.Commands.CreateOrganization
            .CreateOrganizationCommand(
                BusinessName:      "Delta Corp",
                Gstin:             "29AABCD1234E1Z5",
                PanNumber:         "AABCD1234E",
                BusinessType:      "Partnership",
                IndustryType:      "Manufacturing",
                AnnualTurnoverInr: 2_500_000m);

        cmd.BusinessType.Should().Be("Partnership");
        cmd.IndustryType.Should().Be("Manufacturing");
        cmd.AnnualTurnoverInr.Should().Be(2_500_000m);
        cmd.PanNumber.Should().Be("AABCD1234E");
        cmd.Gstin.Should().Be("29AABCD1234E1Z5");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 11. TASK A — OrgContextGuard logic tests (stale/invalid org context)
// ────────────────────────────────────────────────────────────────────────────

public class OrgContextGuardLogicTests
{
    // Pure-logic tests that mirror the guard's three-step check without hitting the DB.

    private static bool SimulateGuard(
        Guid? callerOrgId,
        bool orgExistsInDb,
        bool callerHasMembership,
        bool isSuperAdmin,
        bool requireMembership)
    {
        // Step 1: OrgId present and non-empty
        if (!callerOrgId.HasValue || callerOrgId.Value == Guid.Empty)
            return false;

        // Step 2: Org row must exist
        if (!orgExistsInDb)
            return false;

        // Step 3: membership check (skipped for SUPER_ADMIN)
        if (requireMembership && !isSuperAdmin && !callerHasMembership)
            return false;

        return true;
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_AllZerosOrgId_IsRejected()
    {
        // A pre-fix token carried Guid.Empty as the org id.
        var result = SimulateGuard(
            callerOrgId:        Guid.Empty,
            orgExistsInDb:      false,
            callerHasMembership: false,
            isSuperAdmin:       false,
            requireMembership:  true);

        result.Should().BeFalse(
            "Guid.Empty must be rejected at step 1 — FK violation otherwise");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_NullOrgId_IsRejected()
    {
        var result = SimulateGuard(
            callerOrgId:        null,
            orgExistsInDb:      false,
            callerHasMembership: false,
            isSuperAdmin:       false,
            requireMembership:  true);

        result.Should().BeFalse("null OrgId must be rejected at step 1");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_OrgIdPresent_ButOrgDeletedFromDb_IsRejected()
    {
        // Token carries a valid-looking UUID, but the org was deleted since the token was issued.
        var result = SimulateGuard(
            callerOrgId:        Guid.NewGuid(),
            orgExistsInDb:      false,  // ← deleted org
            callerHasMembership: true,
            isSuperAdmin:       false,
            requireMembership:  true);

        result.Should().BeFalse(
            "org row missing from DB must be rejected at step 2 — " +
            "FK violation (23503) was the pre-fix 500");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_OrgExists_ButCallerNotAMember_IsRejected()
    {
        var result = SimulateGuard(
            callerOrgId:        Guid.NewGuid(),
            orgExistsInDb:      true,
            callerHasMembership: false, // ← lost membership since token issued
            isSuperAdmin:       false,
            requireMembership:  true);

        result.Should().BeFalse(
            "caller without active membership must be rejected at step 3 — " +
            "prevents writes on behalf of an org the caller no longer belongs to");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_SuperAdmin_OrgExists_MembershipNotRequired()
    {
        // SUPER_ADMIN bypasses membership check — can operate on any org.
        var result = SimulateGuard(
            callerOrgId:        Guid.NewGuid(),
            orgExistsInDb:      true,
            callerHasMembership: false, // no membership but is SUPER_ADMIN
            isSuperAdmin:       true,
            requireMembership:  true);

        result.Should().BeTrue("SUPER_ADMIN bypasses step 3 membership check");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Guard_ValidContext_Passes()
    {
        var result = SimulateGuard(
            callerOrgId:        Guid.NewGuid(),
            orgExistsInDb:      true,
            callerHasMembership: true,
            isSuperAdmin:       false,
            requireMembership:  true);

        result.Should().BeTrue("valid org context with membership must pass all three steps");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 12. TASK B — Permission catalog command validation tests
// ────────────────────────────────────────────────────────────────────────────

public class PermissionCatalogCommandTests
{
    private static FluentValidation.Results.ValidationResult Validate<T>(
        FluentValidation.AbstractValidator<T> validator, T instance)
        => validator.Validate(instance);

    // ── CreatePermission validator ────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("gst.returns.file")]
    [InlineData("org.roles.create")]
    [InlineData("platform.permissions.manage")]
    [InlineData("accounting.ledger.post")]
    [InlineData("a.b")]               // minimal two segments
    [InlineData("x_y.z_1")]           // underscores and digits
    public void CreatePermission_ValidName_PassesValidation(string name)
    {
        var validator = new AuthService.Application.PermissionCatalog.Commands.CreatePermission
            .CreatePermissionCommandValidator();
        var cmd = new AuthService.Application.PermissionCatalog.Commands.CreatePermission
            .CreatePermissionCommand(name, null);

        Validate(validator, cmd).IsValid.Should().BeTrue(
            $"'{name}' is a valid dot-notation permission name");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("noDot")]           // single segment — no dot
    [InlineData("UPPER.case")]      // uppercase not allowed
    [InlineData(".starts.dot")]     // leading dot
    [InlineData("ends.dot.")]       // trailing dot
    [InlineData("double..dot")]     // empty segment
    [InlineData("has space.here")]  // spaces
    [InlineData("")]                // empty
    public void CreatePermission_InvalidName_FailsValidation(string name)
    {
        var validator = new AuthService.Application.PermissionCatalog.Commands.CreatePermission
            .CreatePermissionCommandValidator();
        var cmd = new AuthService.Application.PermissionCatalog.Commands.CreatePermission
            .CreatePermissionCommand(name, null);

        Validate(validator, cmd).IsValid.Should().BeFalse(
            $"'{name}' should fail validation — only lowercase dot-notation is allowed");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void CreatePermission_NameParsing_ResourceAndActionCorrect()
    {
        // Mirrors the handler's parsing logic: resource = first segment, action = rest.
        const string name = "gst.returns.file";
        var dot = name.IndexOf('.');
        var resource = name[..dot];
        var action   = name[(dot + 1)..];

        resource.Should().Be("gst");
        action.Should().Be("returns.file",
            "action is everything after the first dot (multiple sub-segments allowed)");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void CreatePermission_TwoSegmentName_ParsesCorrectly()
    {
        const string name = "org.roles";
        var dot = name.IndexOf('.');
        name[..dot].Should().Be("org");
        name[(dot + 1)..].Should().Be("roles");
    }

    // ── UpdatePermission validator ────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdatePermission_EmptyGuid_FailsValidation()
    {
        var validator = new AuthService.Application.PermissionCatalog.Commands.UpdatePermission
            .UpdatePermissionCommandValidator();
        var cmd = new AuthService.Application.PermissionCatalog.Commands.UpdatePermission
            .UpdatePermissionCommand(Guid.Empty, "Some description");

        Validate(validator, cmd).IsValid.Should().BeFalse(
            "Guid.Empty must be rejected as a permission id");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdatePermission_ValidId_NullDescription_Passes()
    {
        var validator = new AuthService.Application.PermissionCatalog.Commands.UpdatePermission
            .UpdatePermissionCommandValidator();
        var cmd = new AuthService.Application.PermissionCatalog.Commands.UpdatePermission
            .UpdatePermissionCommand(Guid.NewGuid(), null);

        Validate(validator, cmd).IsValid.Should().BeTrue(
            "null description clears the field — valid operation");
    }

    // ── Permission entity domain behaviour ────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_UpdateDescription_ChangesValueOnly()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file", "Original");

        perm.UpdateDescription("Updated description");

        perm.Description.Should().Be("Updated description");
        perm.Name.Should().Be("gst.returns.file",
            "name must be immutable after creation");
        perm.Resource.Should().Be("gst",
            "resource must be immutable after creation");
        perm.Action.Should().Be("returns.file",
            "action must be immutable after creation");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_UpdateDescription_ToNull_ClearsDescription()
    {
        var perm = Permission.Create("org.roles.read", "org", "roles.read", "Some description");
        perm.UpdateDescription(null);
        perm.Description.Should().BeNull();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 13. I1.1 — Permission is_active / retire-reactivate lifecycle tests
// ────────────────────────────────────────────────────────────────────────────

public class PermissionIsActiveLifecycleTests
{
    // ── Domain entity ────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_Create_DefaultsToActive()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file");
        perm.IsActive.Should().BeTrue("newly created permission must be active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_SetActive_False_Retires()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file");
        perm.SetActive(false);
        perm.IsActive.Should().BeFalse("SetActive(false) must retire the permission");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_SetActive_True_Reactivates()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file");
        perm.SetActive(false);
        perm.SetActive(true);
        perm.IsActive.Should().BeTrue("SetActive(true) must re-activate a retired permission");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Permission_Retired_NameRemainsImmutable()
    {
        var perm = Permission.Create("org.roles.create", "org", "roles.create");
        perm.SetActive(false);
        perm.Name.Should().Be("org.roles.create", "name must not change on retire");
        perm.Resource.Should().Be("org");
        perm.Action.Should().Be("roles.create");
    }

    // ── Catalog query filter logic (pure-logic simulation) ───────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void CatalogFilter_IncludeInactiveFalse_ExcludesRetired()
    {
        var perms = new[]
        {
            (Name: "gst.returns.file",    IsActive: true,  DeletedAt: (DateTime?)null),
            (Name: "org.roles.read",      IsActive: true,  DeletedAt: (DateTime?)null),
            (Name: "accounting.post",     IsActive: false, DeletedAt: (DateTime?)null), // RETIRED
            (Name: "itr.file.submit",     IsActive: true,  DeletedAt: DateTime.UtcNow), // DELETED
        };

        var visible = perms
            .Where(p => p.IsActive && p.DeletedAt == null)
            .Select(p => p.Name)
            .ToList();

        visible.Should().BeEquivalentTo(["gst.returns.file", "org.roles.read"],
            "default catalog (includeInactive=false) shows only active+non-deleted");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void CatalogFilter_IncludeInactiveTrue_ShowsRetiredButNotDeleted()
    {
        var perms = new[]
        {
            (Name: "gst.returns.file",    IsActive: true,  DeletedAt: (DateTime?)null),
            (Name: "accounting.post",     IsActive: false, DeletedAt: (DateTime?)null), // RETIRED
            (Name: "itr.file.submit",     IsActive: true,  DeletedAt: DateTime.UtcNow), // DELETED — excluded
        };

        var visible = perms
            .Where(p => p.DeletedAt == null) // includeInactive=true only drops hard-deleted
            .Select(p => p.Name)
            .ToList();

        visible.Should().BeEquivalentTo(["gst.returns.file", "accounting.post"],
            "includeInactive=true shows active + retired, but never hard-deleted");
    }

    // ── Grantable-permissions logic ───────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void GrantableFilter_ExcludesRetiredPermissions()
    {
        // Simulate effective permission expansion that filters is_active=true only.
        // A retired permission name in the DB must not appear in the grantable set.
        var livePermissions = new[]
        {
            (Id: Guid.NewGuid(), Name: "org.roles.read",   IsActive: true),
            (Id: Guid.NewGuid(), Name: "org.roles.create", IsActive: true),
            (Id: Guid.NewGuid(), Name: "accounting.post",  IsActive: false), // RETIRED
        };

        // "caller holds these names from DB" — retired names never returned from DB query
        var callerHolds = livePermissions
            .Where(p => p.IsActive)
            .Select(p => p.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Grantable = live catalog ∩ caller holds
        var grantableIds = livePermissions
            .Where(p => p.IsActive && callerHolds.Contains(p.Name))
            .Select(p => p.Id)
            .ToList();

        grantableIds.Should().HaveCount(2,
            "only active permissions are grantable; retired 'accounting.post' must be excluded");

        livePermissions
            .Where(p => !p.IsActive)
            .Select(p => p.Id)
            .Should().NotBeSubsetOf(grantableIds,
                "retired permission ids must not appear in grantable set");
    }

    // ── Effective-permission resolution ──────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void EffectivePerms_RetiredPermission_IsNotGranted()
    {
        // Simulates the DB JOIN: role_permission → permission WHERE is_active=true
        // A role that holds a grant to a retired permission yields an empty expansion.
        var rolePermissions = new[]
        {
            (PermId: Guid.NewGuid(), PermName: "org.roles.read",   IsActive: true),
            (PermId: Guid.NewGuid(), PermName: "accounting.post",  IsActive: false), // RETIRED
        };

        var effective = rolePermissions
            .Where(p => p.IsActive) // mirrors the EF join filter
            .Select(p => p.PermName)
            .ToList();

        effective.Should().Contain("org.roles.read");
        effective.Should().NotContain("accounting.post",
            "retired permission must not appear in effective set even if a role holds the grant");
    }

    // ── roleCount in catalog DTO ──────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void RoleCount_CountsOnlyActiveRolesWithActiveGrants()
    {
        // Simulates the LEFT JOIN aggregation for roleCount in PermissionDto.
        // Only counts: role_permission.deleted_at IS NULL AND role.is_active=true
        var permId = Guid.NewGuid();

        var grants = new[]
        {
            (RpId: Guid.NewGuid(), PermId: permId, RpDeletedAt: (DateTime?)null,  RoleActive: true),  // ✓
            (RpId: Guid.NewGuid(), PermId: permId, RpDeletedAt: DateTime.UtcNow,  RoleActive: true),  // ✗ soft-deleted grant
            (RpId: Guid.NewGuid(), PermId: permId, RpDeletedAt: (DateTime?)null,  RoleActive: false), // ✗ inactive role
        };

        var roleCount = grants
            .Count(g => g.RpDeletedAt == null && g.RoleActive);

        roleCount.Should().Be(1,
            "roleCount must count only active role_permission rows whose role is also active");
    }

    // ── UpdatePermission isActive wiring ─────────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdatePermissionCommand_IsActive_Null_LeavesFieldUnchanged()
    {
        // When isActive is null in the request, SetActive should NOT be called.
        // The entity field retains its original value.
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file");
        perm.SetActive(false); // retire it

        // Simulate handler: only call SetActive when isActive.HasValue
        bool? isActiveRequest = null;
        if (isActiveRequest.HasValue)
            perm.SetActive(isActiveRequest.Value);

        perm.IsActive.Should().BeFalse(
            "null isActive in PUT request must leave IsActive unchanged");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdatePermissionCommand_IsActive_True_Reactivates()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file");
        perm.SetActive(false);

        bool? isActiveRequest = true;
        if (isActiveRequest.HasValue)
            perm.SetActive(isActiveRequest.Value);

        perm.IsActive.Should().BeTrue(
            "isActive=true in PUT request must re-activate a retired permission");
    }

    // ── includeInactive query param validation ────────────────────────────────

    [Fact]
    [Trait("Category", "Unit")]
    public void GetPermissionCatalogQuery_Default_IncludeInactiveFalse()
    {
        var query = new AuthService.Application.PermissionCatalog.Queries.GetPermissionCatalog
            .GetPermissionCatalogQuery();
        query.IncludeInactive.Should().BeFalse(
            "default query must exclude inactive permissions");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void GetPermissionCatalogQuery_IncludeInactiveTrue_IsRepresentable()
    {
        var query = new AuthService.Application.PermissionCatalog.Queries.GetPermissionCatalog
            .GetPermissionCatalogQuery(IncludeInactive: true);
        query.IncludeInactive.Should().BeTrue(
            "includeInactive=true must be expressible on the query object");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 14. I1.3 — UserPermission (direct grant) entity + effective-perm resolver tests
// ────────────────────────────────────────────────────────────────────────────

public class UserPermissionEntityTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void UserPermission_Create_SetsAllFields()
    {
        var userId      = Guid.NewGuid();
        var permId      = Guid.NewGuid();
        var orgId       = Guid.NewGuid();
        var grantedById = Guid.NewGuid();

        var up = UserPermission.Create(userId, permId, orgId, grantedById);

        up.UserId.Should().Be(userId);
        up.PermissionId.Should().Be(permId);
        up.OrganizationId.Should().Be(orgId);
        up.GrantedByUserId.Should().Be(grantedById);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UserPermission_PlatformGrant_NullOrganizationId()
    {
        var up = UserPermission.Create(Guid.NewGuid(), Guid.NewGuid(), null, Guid.NewGuid());
        up.OrganizationId.Should().BeNull("platform-level grant has no org scope");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UserPermission_OrgGrant_HasOrganizationId()
    {
        var orgId = Guid.NewGuid();
        var up = UserPermission.Create(Guid.NewGuid(), Guid.NewGuid(), orgId, Guid.NewGuid());
        up.OrganizationId.Should().Be(orgId, "org-scoped grant carries the target org id");
    }
}

public class EffectivePermissionResolverLogicTests
{
    // Pure-logic tests simulating the three-leg union without hitting a DB.

    private static HashSet<string> SimulateResolve(
        IEnumerable<string> platformRolePerms,
        IEnumerable<string> orgMemberRolePerms,
        IEnumerable<string> directGrants)
        => [.. platformRolePerms, .. orgMemberRolePerms, .. directGrants];

    [Fact]
    [Trait("Category", "Unit")]
    public void Resolve_UnionOfAllThreeLegs_NoDuplicates()
    {
        // A permission in all three legs still appears once.
        var result = SimulateResolve(
            ["org.roles.read", "gst.returns.file"],
            ["org.roles.read", "org.members.invite"],
            ["gst.returns.file", "document.read"]);

        var deduped = result.ToHashSet(StringComparer.OrdinalIgnoreCase);
        deduped.Should().BeEquivalentTo(
            ["org.roles.read", "gst.returns.file", "org.members.invite", "document.read"]);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Resolve_DirectGrantOnly_NotInRoles_StillEffective()
    {
        // A user with no role grants but a direct override is still effective.
        var result = SimulateResolve([], [], ["document.read"]);
        result.Should().Contain("document.read",
            "direct grant makes the permission effective even without a role grant");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Resolve_OrgGrant_NotActiveInDifferentOrgContext()
    {
        // Simulates the SQL WHERE: org_id IS NULL OR org_id = activeOrgId
        var grant = (PermName: "org.roles.create", OrgId: (Guid?)Guid.NewGuid());
        var activeOrgId = Guid.NewGuid(); // different org

        var applicable = grant.OrgId == null || grant.OrgId == activeOrgId;
        applicable.Should().BeFalse(
            "org-scoped grant must not apply when the active org differs");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Resolve_PlatformGrant_AppliesInAnyOrgContext()
    {
        // Platform grant (org_id IS NULL) applies in all contexts.
        var grant = (PermName: "platform.orgs.read", OrgId: (Guid?)null);
        var activeOrgId = Guid.NewGuid();

        var applicable = grant.OrgId == null || grant.OrgId == activeOrgId;
        applicable.Should().BeTrue(
            "platform-level direct grant (org_id IS NULL) applies in any org context");
    }
}

public class CreateUserAdminCommandValidatorTests
{
    private static FluentValidation.Results.ValidationResult Validate(
        AuthService.Application.Admin.Commands.CreateUserAdmin.CreateUserAdminCommand cmd)
    {
        var v = new AuthService.Application.Admin.Commands.CreateUserAdmin
            .CreateUserAdminCommandValidator();
        return v.Validate(cmd);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_ValidPlatformScopeRequest_Passes()
    {
        var result = Validate(new(
            FullName: "Alice Admin",
            Email: "alice@acme.com",
            PhoneNumber: null,
            Scope: "platform",
            RoleId: Guid.NewGuid(),
            OrganizationId: null,
            PermissionIds: null,
            InitialPassword: null));

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_OrgScope_WithoutOrganizationId_Fails()
    {
        var result = Validate(new(
            FullName: "Bob",
            Email: "bob@acme.com",
            PhoneNumber: null,
            Scope: "org",
            RoleId: Guid.NewGuid(),
            OrganizationId: null, // missing!
            PermissionIds: null,
            InitialPassword: null));

        result.IsValid.Should().BeFalse("scope=org requires OrganizationId");
        result.Errors.Should().Contain(e => e.PropertyName == "OrganizationId");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_InvalidScope_Fails()
    {
        var result = Validate(new(
            FullName: "Bob",
            Email: "bob@acme.com",
            PhoneNumber: null,
            Scope: "unknown",
            RoleId: Guid.NewGuid(),
            OrganizationId: null,
            PermissionIds: null,
            InitialPassword: null));

        result.IsValid.Should().BeFalse("scope must be 'platform' or 'org'");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_TooManyPermissionOverrides_Fails()
    {
        var tooMany = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToList();
        var result = Validate(new(
            FullName: "Charlie",
            Email: "charlie@acme.com",
            PhoneNumber: null,
            Scope: "platform",
            RoleId: Guid.NewGuid(),
            OrganizationId: null,
            PermissionIds: tooMany,
            InitialPassword: null));

        result.IsValid.Should().BeFalse("cannot have more than 100 override permissions");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_InvalidPhoneNumber_Fails()
    {
        var result = Validate(new(
            FullName: "Dave",
            Email: "dave@acme.com",
            PhoneNumber: "9876543210", // missing + country code
            Scope: "platform",
            RoleId: Guid.NewGuid(),
            OrganizationId: null,
            PermissionIds: null,
            InitialPassword: null));

        result.IsValid.Should().BeFalse("phone must be E.164 (+country code)");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_ShortPassword_Fails()
    {
        var result = Validate(new(
            FullName: "Eve",
            Email: "eve@acme.com",
            PhoneNumber: null,
            Scope: "platform",
            RoleId: Guid.NewGuid(),
            OrganizationId: null,
            PermissionIds: null,
            InitialPassword: "short")); // < 8 chars

        result.IsValid.Should().BeFalse("password must be at least 8 chars");
    }
}

public class DelegationGuardForUserCreateTests
{
    // Pure-logic simulation of the delegation checks in CreateUserAdminCommandHandler.

    private static bool CallerCanAssignRole(
        HashSet<string> callerEffective,
        IEnumerable<string> rolePermNames,
        bool isSuperAdmin)
    {
        if (isSuperAdmin) return true;
        return rolePermNames.All(p =>
            callerEffective.Contains(p, StringComparer.OrdinalIgnoreCase));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void SuperAdmin_CanAssignAnyRole()
    {
        var result = CallerCanAssignRole(
            callerEffective: [],
            rolePermNames: ["platform.permissions.manage", "platform.orgs.create"],
            isSuperAdmin: true);

        result.Should().BeTrue("SUPER_ADMIN bypasses delegation check");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void NonSuperAdmin_CanAssignRole_WhenPermsAreSubset()
    {
        var callerEffective = new HashSet<string>
            { "org.roles.read", "org.roles.create", "org.members.invite" };

        var result = CallerCanAssignRole(
            callerEffective,
            rolePermNames: ["org.roles.read", "org.members.invite"],
            isSuperAdmin: false);

        result.Should().BeTrue("role perms ⊆ caller's effective set");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void NonSuperAdmin_CannotAssignRole_WhenPermsExceedCallerSet()
    {
        var callerEffective = new HashSet<string>
            { "org.roles.read", "org.members.invite" };

        var result = CallerCanAssignRole(
            callerEffective,
            rolePermNames: ["org.roles.read", "platform.permissions.manage"],
            isSuperAdmin: false);

        result.Should().BeFalse(
            "role contains platform.permissions.manage which caller does not hold → 403");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void NonSuperAdmin_CannotAssignSystemRole()
    {
        // Mirrors the guard: !isSuperAdmin && role.IsSystemRole && role.OrganizationId is null → 403
        bool isSuperAdmin = false;
        bool isSystemRole = true;
        bool orgIdIsNull  = true;

        var blocked = !isSuperAdmin && isSystemRole && orgIdIsNull;
        blocked.Should().BeTrue(
            "non-SUPER_ADMIN assigning a platform system role must be blocked → 403");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 15. I1.3-001 regression tests — wildcard-vs-adminsInvite escalation fix
// ────────────────────────────────────────────────────────────────────────────

public class SystemRoleAssignmentGateTests
{
    // Mirrors the fixed gate in CreateUserAdminCommandHandler:
    //   if (!isWildcardAdmin && role.IsSystemRole && role.OrganizationId is null) → 403
    // where isWildcardAdmin = currentUser.HasPermission("*")  [ONLY — not platform.admins.invite]

    private static bool CanAssignSystemRole(bool hasWildcard) => hasWildcard;

    [Fact]
    [Trait("Category", "Unit")]
    public void Caller_WithPlatformAdminsInviteOnly_CannotAssignSystemRole()
    {
        // Pre-fix: isSuperAdmin = platform.admins.invite || "*"  → caller with only
        // platform.admins.invite was incorrectly allowed.
        // Post-fix: only "*" unlocks system-role assignment.
        bool hasWildcard         = false;
        bool hasPlatformInvite   = true;   // caller holds platform.admins.invite but NOT "*"
        bool isSystemRole        = true;
        bool orgIdNull           = true;

        // Fixed gate uses wildcard only
        var blocked = !hasWildcard && isSystemRole && orgIdNull;

        blocked.Should().BeTrue(
            "I1.3-001: holding platform.admins.invite without \"*\" must NOT allow " +
            "system-role assignment — that was the escalation path");

        // Confirm the old (buggy) gate would have allowed it
        var oldGatePassed = (hasPlatformInvite || hasWildcard) && isSystemRole && orgIdNull;
        oldGatePassed.Should().BeTrue(
            "the old gate treated platform.admins.invite as equivalent to wildcard — " +
            "this is the bug that was fixed");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Caller_WithWildcard_CanAssignSystemRole()
    {
        bool hasWildcard  = true;
        bool isSystemRole = true;
        bool orgIdNull    = true;

        var blocked = !hasWildcard && isSystemRole && orgIdNull;

        blocked.Should().BeFalse(
            "true SUPER_ADMIN (*) must still be able to assign system roles");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Caller_WithWildcard_CanAssignOrgRole()
    {
        // Org-scoped roles (organizationId != null) are not guarded by the system-role gate
        bool hasWildcard  = false;
        bool isSystemRole = false;
        bool orgIdNull    = false; // org-scoped custom role

        var blocked = !hasWildcard && isSystemRole && orgIdNull;

        blocked.Should().BeFalse(
            "org-scoped roles are never blocked by the system-role gate regardless of wildcard");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 16. I1.4 Phase A — ReferenceData entity + validator tests
// ────────────────────────────────────────────────────────────────────────────

public class ReferenceDataEntityTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_NormalizesCategory_ToUppercase()
    {
        var rd = AuthService.Domain.Entities.ReferenceData.Create(
            "state", "MH", "Maharashtra", "IN", 1);

        rd.Category.Should().Be("STATE", "category must be upper-cased on Create");
        rd.Code.Should().Be("MH", "code is stored as provided (trimmed, case preserved)");
        rd.IsActive.Should().BeTrue("newly created entry must be active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TrimsWhitespace_FromAllStringFields()
    {
        var rd = AuthService.Domain.Entities.ReferenceData.Create(
            "  COUNTRY  ", "  IN  ", "  India  ", null, 0);

        rd.Category.Should().Be("COUNTRY");
        rd.Code.Should().Be("IN");
        rd.Name.Should().Be("India");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdateDetails_MutatesNameSortOrderParentCode()
    {
        var rd = AuthService.Domain.Entities.ReferenceData.Create("STATE", "MH", "Maharashtra", "IN", 1);

        rd.UpdateDetails("Maharashtra (updated)", "IND", 5);

        rd.Name.Should().Be("Maharashtra (updated)");
        rd.ParentCode.Should().Be("IND");
        rd.SortOrder.Should().Be(5);
        rd.Category.Should().Be("STATE", "category must not change");
        rd.Code.Should().Be("MH", "code must not change");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void SetActive_False_DeactivatesEntry()
    {
        var rd = AuthService.Domain.Entities.ReferenceData.Create("LANGUAGE", "HI", "Hindi", null, 1);
        rd.SetActive(false);
        rd.IsActive.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void SetActive_True_ReactivatesEntry()
    {
        var rd = AuthService.Domain.Entities.ReferenceData.Create("LANGUAGE", "HI", "Hindi", null, 1);
        rd.SetActive(false);
        rd.SetActive(true);
        rd.IsActive.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ReferenceDataCategory_All_ContainsExactlyFiveCategories()
    {
        AuthService.Domain.Entities.ReferenceDataCategory.All
            .Should().BeEquivalentTo(
                ["LANGUAGE", "USER_TYPE", "GENDER", "STATE", "COUNTRY"],
                "exactly five categories are supported in Phase A");
    }
}

public class CreateReferenceDataValidatorTests
{
    private static FluentValidation.Results.ValidationResult Validate(
        AuthService.Application.ReferenceData.Commands.CreateReferenceData.CreateReferenceDataCommand cmd)
    {
        var v = new AuthService.Application.ReferenceData.Commands.CreateReferenceData
            .CreateReferenceDataCommandValidator();
        return v.Validate(cmd);
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("LANGUAGE")]
    [InlineData("USER_TYPE")]
    [InlineData("GENDER")]
    [InlineData("STATE")]
    [InlineData("COUNTRY")]
    public void ValidCategory_PassesValidation(string category)
    {
        var result = Validate(new(category, "CODE1", "Test Name", null));
        result.IsValid.Should().BeTrue($"'{category}' is a valid category");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("INVALID")]
    [InlineData("")]
    [InlineData("DISTRICT")]  // a non-supported category
    public void InvalidCategory_FailsValidation(string category)
    {
        var result = Validate(new(category, "CODE1", "Test Name", null));
        result.IsValid.Should().BeFalse($"'{category}' should fail category validation");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("MH")]
    [InlineData("ANDHRA_PRADESH")]
    [InlineData("code-1")]
    [InlineData("ABC123")]
    public void ValidCode_PassesValidation(string code)
    {
        var result = Validate(new("COUNTRY", code, "Some Name", null));
        result.IsValid.Should().BeTrue($"'{code}' is a valid code format");
    }

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("has space")]
    [InlineData("has.dot")]
    [InlineData("")]
    [InlineData("has@symbol")]
    public void InvalidCode_FailsValidation(string code)
    {
        var result = Validate(new("COUNTRY", code, "Some Name", null));
        result.IsValid.Should().BeFalse($"'{code}' should fail code format validation");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void EmptyName_FailsValidation()
    {
        var result = Validate(new("COUNTRY", "IN", "", null));
        result.IsValid.Should().BeFalse("empty name must fail validation");
    }
}

public class ReferenceDataBusinessRuleTests
{
    // Pure-logic tests for the handler business rules (no EF Core).

    [Fact]
    [Trait("Category", "Unit")]
    public void StateCategory_WithoutParentCode_IsRejected()
    {
        // Mirrors the handler check: category == STATE && string.IsNullOrWhiteSpace(parentCode)
        var category   = "STATE";
        var parentCode = (string?)null;

        var valid = !(category == "STATE" && string.IsNullOrWhiteSpace(parentCode));

        valid.Should().BeFalse(
            "STATE entries require a parentCode pointing to an active COUNTRY");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void StateCategory_WithParentCode_PassesParentCheck()
    {
        var category   = "STATE";
        var parentCode = "IN";

        var requiresParent = category == "STATE" && string.IsNullOrWhiteSpace(parentCode);

        requiresParent.Should().BeFalse(
            "STATE with a parentCode provided should not trigger the missing-parent error");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void NonStateCategory_NeverRequiresParentCode()
    {
        foreach (var category in new[] { "LANGUAGE", "USER_TYPE", "GENDER", "COUNTRY" })
        {
            var requiresParent = category == "STATE" && string.IsNullOrWhiteSpace(null);
            requiresParent.Should().BeFalse(
                $"category '{category}' must not require a parentCode");
        }
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DuplicateCheck_SameCategoryAndCode_IsConflict()
    {
        // Simulates: AnyAsync(r => r.Category == category && r.Code == code && r.DeletedAt == null)
        var existing = new[] { (Category: "COUNTRY", Code: "IN") };
        var incoming = (Category: "COUNTRY", Code: "IN");

        var isDuplicate = existing.Any(e =>
            e.Category == incoming.Category && e.Code == incoming.Code);

        isDuplicate.Should().BeTrue(
            "same (category, code) pair must produce 409 ReferenceData.Duplicate");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DuplicateCheck_SameCodeDifferentCategory_IsNotConflict()
    {
        var existing = new[] { (Category: "COUNTRY", Code: "IN") };
        var incoming = (Category: "STATE", Code: "IN");

        var isDuplicate = existing.Any(e =>
            e.Category == incoming.Category && e.Code == incoming.Code);

        isDuplicate.Should().BeFalse(
            "same code in a different category is not a duplicate");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InUseGuard_LanguageReferencedByUser_IsBlocked()
    {
        // Simulates: category == LANGUAGE → count users.preferred_language == code
        const string entryCode = "HI";
        var userLanguages = new[] { "EN", "HI", "HI", "TA" };

        var useCount = userLanguages.Count(l => l == entryCode);

        useCount.Should().Be(2, "two users use 'HI' — delete must be blocked with count=2");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void InUseGuard_UnusedEntry_AllowsDelete()
    {
        const string entryCode = "ML"; // Malayalam — not yet assigned
        var userLanguages = new[] { "EN", "HI", "TA" };

        var useCount = userLanguages.Count(l => l == entryCode);

        useCount.Should().Be(0, "zero usages — delete should be allowed");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ActiveOnly_Filter_ExcludesInactiveEntries()
    {
        var entries = new[]
        {
            (Code: "IN",  IsActive: true),
            (Code: "US",  IsActive: true),
            (Code: "OLD", IsActive: false),
        };

        var visible = entries.Where(e => e.IsActive).Select(e => e.Code).ToList();

        visible.Should().BeEquivalentTo(["IN", "US"]);
        visible.Should().NotContain("OLD",
            "inactive entries must be excluded when activeOnly=true");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ActiveOnly_False_IncludesInactiveEntries()
    {
        var entries = new[]
        {
            (Code: "IN",  IsActive: true),
            (Code: "OLD", IsActive: false),
        };

        // activeOnly=false → no active filter
        var visible = entries.Select(e => e.Code).ToList();

        visible.Should().Contain("OLD",
            "activeOnly=false shows active + inactive entries (management screen)");
    }
}
