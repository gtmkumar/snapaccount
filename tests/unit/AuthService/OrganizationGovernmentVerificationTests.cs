using AuthService.Application.PlatformAdmin.Commands.UpdateOrganizationSettings;
using AuthService.Application.PlatformAdmin.Queries.ListPlatformOrganizations;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for Part A — organization GovernmentVerificationEnabled toggle.
/// Covers: domain method, command handler, DTO projection.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OrganizationGovernmentVerificationTests : IDisposable
{
    private readonly AuthDbContext _db;

    public OrganizationGovernmentVerificationTests()
    {
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new AuthDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    // ── Domain entity ────────────────────────────────────────────────────────

    [Fact]
    public void Organization_SetGovernmentVerification_True_SetsFlag()
    {
        var org = new Organization { BusinessName = "TestCo" };
        org.GovernmentVerificationEnabled.Should().BeFalse("default is false");

        org.SetGovernmentVerification(true);
        org.GovernmentVerificationEnabled.Should().BeTrue();
    }

    [Fact]
    public void Organization_SetGovernmentVerification_False_ClearsFlag()
    {
        var org = new Organization { BusinessName = "TestCo" };
        org.SetGovernmentVerification(true);
        org.SetGovernmentVerification(false);
        org.GovernmentVerificationEnabled.Should().BeFalse();
    }

    [Fact]
    public void Organization_SetGovernmentVerification_Idempotent()
    {
        var org = new Organization { BusinessName = "TestCo" };
        org.SetGovernmentVerification(true);
        org.SetGovernmentVerification(true); // second call — no exception
        org.GovernmentVerificationEnabled.Should().BeTrue();
    }

    // ── Command handler ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateOrganizationSettings_EnablesFlag_PersistsAndReturns()
    {
        var org = new Organization { BusinessName = "TestCo" };
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        var repo = new OrganizationRepository(_db);
        var handler = new UpdateOrganizationSettingsCommandHandler(repo);

        var result = await handler.Handle(
            new UpdateOrganizationSettingsCommand(org.Id, true),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.GovernmentVerificationEnabled.Should().BeTrue();
        result.Value.OrganizationId.Should().Be(org.Id);

        var persisted = await _db.Organizations.FindAsync(org.Id);
        persisted!.GovernmentVerificationEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateOrganizationSettings_DisablesFlag_Persists()
    {
        var org = new Organization { BusinessName = "TestCo" };
        org.SetGovernmentVerification(true);
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        var repo = new OrganizationRepository(_db);
        var handler = new UpdateOrganizationSettingsCommandHandler(repo);

        var result = await handler.Handle(
            new UpdateOrganizationSettingsCommand(org.Id, false),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.GovernmentVerificationEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateOrganizationSettings_UnknownOrg_ReturnsNotFound()
    {
        var repo = new OrganizationRepository(_db);
        var handler = new UpdateOrganizationSettingsCommandHandler(repo);

        var result = await handler.Handle(
            new UpdateOrganizationSettingsCommand(Guid.NewGuid(), true),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ── Validator ────────────────────────────────────────────────────────────

    [Fact]
    public void UpdateOrganizationSettingsValidator_EmptyOrgId_Fails()
    {
        var v = new UpdateOrganizationSettingsCommandValidator();
        v.Validate(new UpdateOrganizationSettingsCommand(Guid.Empty, true)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void UpdateOrganizationSettingsValidator_ValidId_Passes()
    {
        var v = new UpdateOrganizationSettingsCommandValidator();
        v.Validate(new UpdateOrganizationSettingsCommand(Guid.NewGuid(), false)).IsValid.Should().BeTrue();
    }

    // ── DTO projection ───────────────────────────────────────────────────────

    [Fact]
    public async Task ListPlatformOrganizations_IncludesGovernmentVerificationEnabled()
    {
        var ownerUserId = Guid.NewGuid();
        var org = new Organization
        {
            BusinessName = "TestCo",
            OwnerUserId  = ownerUserId
        };
        org.SetGovernmentVerification(true);
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        var handler = new ListPlatformOrganizationsQueryHandler(_db);
        var result  = await handler.Handle(
            new ListPlatformOrganizationsQuery(1, 20, null, null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var dto = result.Value.Items.Single(x => x.Id == org.Id);
        dto.GovernmentVerificationEnabled.Should().BeTrue();
    }
}
