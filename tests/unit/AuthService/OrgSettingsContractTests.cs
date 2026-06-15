using AuthService.Application.Organizations.Commands.UpdateOrgSettings;
using AuthService.Application.Organizations.Queries.GetOrgSettings;
using AuthService.Application.Config.Queries.GetPrivacyContact;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for CONTRACT-GAPS board task #27 changes to AuthService:
/// <list type="number">
///   <item>Task 1 — PATCH /auth/org/settings: org name edit + GSTIN explicit rejection.</item>
///   <item>Task 2 — GET /auth/org/settings: addressLine2 included in response DTO.</item>
///   <item>Task 4 — GET /auth/config/privacy-contact: DPO details from configuration.</item>
/// </list>
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OrgSettingsContractTests : IDisposable
{
    private readonly AuthDbContext _db;

    public OrgSettingsContractTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private ICurrentUser CurrentUser(Guid orgId, Guid ownerId)
    {
        var m = new Mock<ICurrentUser>();
        m.SetupGet(x => x.UserId).Returns(ownerId);
        m.SetupGet(x => x.OrganizationId).Returns(orgId);
        m.SetupGet(x => x.IsAuthenticated).Returns(true);
        return m.Object;
    }

    private async Task<(Organization Org, User Owner)> SeedOrg(
        string name = "Acme Ltd",
        string? addressLine2 = null)
    {
        var ownerId = Guid.NewGuid();

        var user = new User
        {
            Email       = "owner@acme.com",
            PhoneNumber = "+919876543210",
            FullName    = "Owner"
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(); // generate user.Id

        var org = new Organization
        {
            BusinessName    = name,
            OwnerUserId     = user.Id,
            Gstin           = "29ABCDE1234F1Z5",
            IsGstRegistered = true
        };
        org.UpdateSettings(null, null, "12 MG Road", addressLine2, "Bengaluru", "Karnataka", "560001");
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync(); // generate org.Id

        return (org, user);
    }

    // ── Task 1: Org name edit ─────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateOrgSettings_Name_Updates_BusinessName()
    {
        var (org, owner) = await SeedOrg("Old Name");
        var handler = new UpdateOrgSettingsCommandHandler(_db, CurrentUser(org.Id, owner.Id));

        var result = await handler.Handle(
            new UpdateOrgSettingsCommand(Name: "New Corp Name", null, null, null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var persisted = await _db.Organizations.FindAsync(org.Id);
        persisted!.BusinessName.Should().Be("New Corp Name");
    }

    [Fact]
    public async Task UpdateOrgSettings_NullName_Does_Not_Clear_BusinessName()
    {
        var (org, owner) = await SeedOrg("Existing Name");
        var handler = new UpdateOrgSettingsCommandHandler(_db, CurrentUser(org.Id, owner.Id));

        var result = await handler.Handle(
            new UpdateOrgSettingsCommand(Name: null, LogoUrl: "https://cdn.example.com/logo.png", null, null, null, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var persisted = await _db.Organizations.FindAsync(org.Id);
        persisted!.BusinessName.Should().Be("Existing Name", "null name should leave existing value intact");
        persisted.LogoUrl.Should().Be("https://cdn.example.com/logo.png");
    }

    [Fact]
    public void UpdateOrgSettings_Validator_Rejects_Gstin_With_Clear_Message()
    {
        var validator = new UpdateOrgSettingsCommandValidator();
        var cmd = new UpdateOrgSettingsCommand(null, null, null, null, null, null, null, Gstin: "29ABCDE1234F1Z5");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e =>
            e.PropertyName == "Gstin" &&
            e.ErrorMessage.Contains("re-verification") &&
            e.ErrorMessage.Contains("support"));
    }

    [Fact]
    public void UpdateOrgSettings_Validator_Accepts_Null_Gstin()
    {
        var validator = new UpdateOrgSettingsCommandValidator();
        // Null Gstin means "not supplied" — the validator should pass.
        var cmd = new UpdateOrgSettingsCommand(null, null, null, null, null, null, null, Gstin: null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue("null Gstin means 'not supplied' — valid");
    }

    [Fact]
    public void UpdateOrgSettings_Validator_Rejects_Empty_Name_When_Supplied()
    {
        var validator = new UpdateOrgSettingsCommandValidator();
        var cmd = new UpdateOrgSettingsCommand(Name: "", null, null, null, null, null, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public void UpdateOrgSettings_Validator_Rejects_Name_Over_255_Chars()
    {
        var validator = new UpdateOrgSettingsCommandValidator();
        var cmd = new UpdateOrgSettingsCommand(
            Name: new string('A', 256),
            null, null, null, null, null, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public void UpdateOrgSettings_Validator_Rejects_Invalid_Pincode()
    {
        var validator = new UpdateOrgSettingsCommandValidator();
        var cmd = new UpdateOrgSettingsCommand(null, null, null, null, null, null, Pincode: "12345");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Pincode");
    }

    [Fact]
    public async Task UpdateOrgSettings_NoOrg_Returns_Forbidden()
    {
        var noOrgUser = new Mock<ICurrentUser>();
        noOrgUser.SetupGet(x => x.OrganizationId).Returns((Guid?)null);
        var handler = new UpdateOrgSettingsCommandHandler(_db, noOrgUser.Object);

        var result = await handler.Handle(
            new UpdateOrgSettingsCommand("Name", null, null, null, null, null, null),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Forbidden);
    }

    // ── Task 2: addressLine2 in GET response ──────────────────────────────────────

    [Fact]
    public async Task GetOrgSettings_Returns_AddressLine2_When_Populated()
    {
        var (org, owner) = await SeedOrg(addressLine2: "Suite 404");
        var handler = new GetOrgSettingsQueryHandler(_db, CurrentUser(org.Id, owner.Id));

        var result = await handler.Handle(new GetOrgSettingsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AddressLine2.Should().Be("Suite 404");
    }

    [Fact]
    public async Task GetOrgSettings_Returns_Null_AddressLine2_When_Not_Set()
    {
        var (org, owner) = await SeedOrg(addressLine2: null);
        var handler = new GetOrgSettingsQueryHandler(_db, CurrentUser(org.Id, owner.Id));

        var result = await handler.Handle(new GetOrgSettingsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AddressLine2.Should().BeNull("field is optional — null is correct when not set");
    }

    [Fact]
    public async Task GetOrgSettings_Response_DTO_Includes_Name_Field()
    {
        var (org, owner) = await SeedOrg("Verified Corp");
        var handler = new GetOrgSettingsQueryHandler(_db, CurrentUser(org.Id, owner.Id));

        var result = await handler.Handle(new GetOrgSettingsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Name.Should().Be("Verified Corp");
    }

    [Fact]
    public async Task PatchThenGet_AddressLine2_RoundTrip()
    {
        var (org, owner) = await SeedOrg(addressLine2: null);
        var currentUser = CurrentUser(org.Id, owner.Id);

        // Write addressLine2 via PATCH
        var patchHandler = new UpdateOrgSettingsCommandHandler(_db, currentUser);
        var patchResult = await patchHandler.Handle(
            new UpdateOrgSettingsCommand(null, null, null, "Floor 3, Block B", null, null, null),
            CancellationToken.None);
        patchResult.IsSuccess.Should().BeTrue();

        // Read it back via GET
        var getHandler = new GetOrgSettingsQueryHandler(_db, currentUser);
        var getResult = await getHandler.Handle(new GetOrgSettingsQuery(), CancellationToken.None);

        getResult.IsSuccess.Should().BeTrue();
        getResult.Value.AddressLine2.Should().Be("Floor 3, Block B");
    }

    // ── Task 4: GET /auth/config/privacy-contact ──────────────────────────────────

    [Fact]
    public async Task GetPrivacyContact_Development_Returns_Placeholders_When_Config_Empty()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([
                new KeyValuePair<string, string?>("ASPNETCORE_ENVIRONMENT", "Development")
            ])
            .Build();
        var handler = new GetPrivacyContactQueryHandler(config);

        var result = await handler.Handle(new GetPrivacyContactQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Name.Should().NotBeNullOrWhiteSpace("Dev placeholder should be present");
        result.Value.Email.Should().NotBeNullOrWhiteSpace();
        result.Value.Address.Should().NotBeNullOrWhiteSpace();
        result.Value.Email.Should().Contain("@", "email placeholder should be valid-looking");
    }

    [Fact]
    public async Task GetPrivacyContact_Returns_Configured_Values_When_Present()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([
                new KeyValuePair<string, string?>("Privacy:Contact:Name", "Ravi Kumar"),
                new KeyValuePair<string, string?>("Privacy:Contact:Email", "dpo@snapaccount.in"),
                new KeyValuePair<string, string?>("Privacy:Contact:Address", "123 Brigade Road, Bengaluru 560001"),
                new KeyValuePair<string, string?>("ASPNETCORE_ENVIRONMENT", "Production")
            ])
            .Build();
        var handler = new GetPrivacyContactQueryHandler(config);

        var result = await handler.Handle(new GetPrivacyContactQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Name.Should().Be("Ravi Kumar");
        result.Value.Email.Should().Be("dpo@snapaccount.in");
        result.Value.Address.Should().Be("123 Brigade Road, Bengaluru 560001");
    }

    [Fact]
    public async Task GetPrivacyContact_NonDevelopment_Empty_Config_Returns_Empty_Fields()
    {
        // Non-Development with no config: returns empty strings — does NOT throw or fail.
        // TL-10 (DPO appointment) is pending; system must not fail startup or requests.
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([
                new KeyValuePair<string, string?>("ASPNETCORE_ENVIRONMENT", "Production")
            ])
            .Build();
        var handler = new GetPrivacyContactQueryHandler(config);

        var result = await handler.Handle(new GetPrivacyContactQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("non-Development with missing config must not fail");
        result.Value.Name.Should().Be(string.Empty);
        result.Value.Email.Should().Be(string.Empty);
        result.Value.Address.Should().Be(string.Empty);
    }

    [Fact]
    public async Task GetPrivacyContact_Development_Partial_Config_Uses_Actual_Values_And_Fills_Missing()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([
                new KeyValuePair<string, string?>("Privacy:Contact:Email", "actual@dpo.com"),
                new KeyValuePair<string, string?>("ASPNETCORE_ENVIRONMENT", "Development")
            ])
            .Build();
        var handler = new GetPrivacyContactQueryHandler(config);

        var result = await handler.Handle(new GetPrivacyContactQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Email.Should().Be("actual@dpo.com", "configured value wins over placeholder");
        result.Value.Name.Should().NotBeNullOrWhiteSpace("placeholder fills missing Name in dev");
        result.Value.Address.Should().NotBeNullOrWhiteSpace("placeholder fills missing Address in dev");
    }
}
