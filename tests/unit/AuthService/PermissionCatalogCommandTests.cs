// Unit tests: Permission Catalog — domain entity + validator tests
//
// These tests operate on domain entities and FluentValidation validators only —
// no EF Core, no IAuthDbContext. Handler tests that require a real DB context
// are in tests/integration/AuthService/PermissionCatalogApiTests.cs.
//
// Covers:
//   - Permission.Create: name/resource/action/description set correctly
//   - Permission.UpdateDescription: mutates description only
//   - CreatePermissionCommandValidator: valid names pass, bad formats fail
//   - OrgContextGuard error-code constant is stable

using AuthService.Application.Common.Guards;
using AuthService.Application.PermissionCatalog.Commands.CreatePermission;
using AuthService.Domain.Entities;
using FluentAssertions;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

// ─────────────────────────────────────────────────────────────────────────────
// Permission entity tests
// ─────────────────────────────────────────────────────────────────────────────

public class PermissionEntityTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TwoSegmentName_SetsAllProperties()
    {
        var perm = Permission.Create("org.roles.read", "org", "roles.read", "Read org roles");

        perm.Name.Should().Be("org.roles.read");
        perm.Resource.Should().Be("org");
        perm.Action.Should().Be("roles.read");
        perm.Description.Should().Be("Read org roles");
        perm.Id.Should().NotBe(Guid.Empty);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_ThreePartAction_StoredCorrectly()
    {
        var perm = Permission.Create("gst.returns.file", "gst", "returns.file", null);

        perm.Resource.Should().Be("gst");
        perm.Action.Should().Be("returns.file");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_NullDescription_DescriptionIsNull()
    {
        var perm = Permission.Create("qa.test.perm", "qa", "test.perm", null);
        perm.Description.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdateDescription_ChangesDescriptionOnly()
    {
        var perm = Permission.Create("qa.update.test", "qa", "update.test", "Original");

        perm.UpdateDescription("Updated description");

        perm.Description.Should().Be("Updated description");
        perm.Name.Should().Be("qa.update.test",
            "name must be immutable — changing it breaks [RequiresPermission] decorations");
        perm.Resource.Should().Be("qa");
        perm.Action.Should().Be("update.test");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void UpdateDescription_Null_ClearsDescription()
    {
        var perm = Permission.Create("qa.clear.desc", "qa", "clear.desc", "Will be cleared");

        perm.UpdateDescription(null);

        perm.Description.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TwoDistinctPermissions_HaveDifferentIds()
    {
        var a = Permission.Create("qa.perm.a", "qa", "perm.a", null);
        var b = Permission.Create("qa.perm.b", "qa", "perm.b", null);

        a.Id.Should().NotBe(b.Id, "each permission must have a unique ID");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void DeletedAt_DefaultIsNull()
    {
        var perm = Permission.Create("qa.deleted.test", "qa", "deleted.test", null);
        perm.DeletedAt.Should().BeNull("newly created permission must not be soft-deleted");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatePermissionCommandValidator — format rules
// ─────────────────────────────────────────────────────────────────────────────

public class CreatePermissionCommandValidatorTests
{
    private readonly CreatePermissionCommandValidator _validator = new();

    // ── Valid names ──────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("gst.returns.file")]
    [InlineData("org.roles.create")]
    [InlineData("platform.permissions.manage")]
    [InlineData("accounting.journal.reverse")]
    [InlineData("a.b")]                   // minimal two-segment
    [InlineData("abc_123.xyz_456")]       // underscores and digits
    [InlineData("qa.unit.three.segments")]// multi-segment action
    public void Validate_ValidNames_Pass(string name)
    {
        var result = _validator.Validate(new CreatePermissionCommand(name, "description"));
        result.IsValid.Should().BeTrue($"'{name}' must be a valid permission name");
    }

    // ── Invalid names ────────────────────────────────────────────────────────

    [Theory]
    [Trait("Category", "Unit")]
    [InlineData("UPPERCASE",          "uppercase letters not allowed")]
    [InlineData("no-dot",             "no dot separator")]
    [InlineData(".leading.dot",       "leading dot")]
    [InlineData("trailing.dot.",      "trailing dot")]
    [InlineData("has spaces.action",  "spaces are not allowed")]
    [InlineData("has-hyphen.action",  "hyphens not in allowed charset")]
    [InlineData("CamelCase.action",   "mixed case not allowed")]
    [InlineData("one",                "single segment — no dot")]
    public void Validate_InvalidNames_Fail(string name, string reason)
    {
        var result = _validator.Validate(new CreatePermissionCommand(name, "description"));
        result.IsValid.Should().BeFalse($"'{name}' must fail validation: {reason}");
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreatePermissionCommand.Name));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_EmptyName_FailsWithRequired()
    {
        var result = _validator.Validate(new CreatePermissionCommand("", "desc"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_NameOver200Chars_Fails()
    {
        var longName = "qa." + new string('a', 200);
        var result = _validator.Validate(new CreatePermissionCommand(longName, "desc"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_DescriptionOver500Chars_Fails()
    {
        var longDesc = new string('x', 501);
        var result = _validator.Validate(new CreatePermissionCommand("qa.valid.name", longDesc));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreatePermissionCommand.Description));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_NullDescription_Passes()
    {
        // Description is optional (null allowed, only max-length validated when non-null)
        var result = _validator.Validate(new CreatePermissionCommand("qa.valid.perm", null));
        result.IsValid.Should().BeTrue("null description must be accepted");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Validate_DescriptionExactly500Chars_Passes()
    {
        var desc500 = new string('x', 500);
        var result = _validator.Validate(new CreatePermissionCommand("qa.valid.perm2", desc500));
        result.IsValid.Should().BeTrue("500-char description is at the limit — must be valid");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgContextGuard error-code contract
// ─────────────────────────────────────────────────────────────────────────────

public class OrgContextGuardContractTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void ErrorCode_IsOrgDotInvalidContext()
    {
        // The error code is referenced in tests and potentially in client-side error mapping.
        // Ensure it never changes without a deliberate decision.
        OrgContextGuard.ErrorCode.Should().Be("Org.InvalidContext",
            "error code contract must be stable — changing it is a breaking change for API consumers");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ErrorCode_FollowsDotNotationConvention()
    {
        var parts = OrgContextGuard.ErrorCode.Split('.');
        parts.Should().HaveCountGreaterThanOrEqualTo(2,
            "error codes follow the resource.type convention");
        parts[0].Should().NotBeNullOrWhiteSpace();
        parts[1].Should().NotBeNullOrWhiteSpace();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RolePermission.Create unit tests
// ─────────────────────────────────────────────────────────────────────────────

public class RolePermissionEntityTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void Create_SetsRoleIdAndPermissionId()
    {
        var roleId = Guid.NewGuid();
        var permId = Guid.NewGuid();

        var rp = RolePermission.Create(roleId, permId);

        rp.RoleId.Should().Be(roleId);
        rp.PermissionId.Should().Be(permId);
        rp.Id.Should().NotBe(Guid.Empty);
        rp.DeletedAt.Should().BeNull("newly created grant is active");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void Create_TwoDifferentGrants_HaveDistinctIds()
    {
        var rp1 = RolePermission.Create(Guid.NewGuid(), Guid.NewGuid());
        var rp2 = RolePermission.Create(Guid.NewGuid(), Guid.NewGuid());

        rp1.Id.Should().NotBe(rp2.Id);
    }
}
