// Unit tests: GrantConsentCommand (GAP-DPDP-CONSENT-01 / 02).
//
// Verifies the affirmative-consent write path and the shared purpose taxonomy:
//   1. Grant writes a single "granted" row with the captured IP + resolved description.
//   2. Grant is idempotent for an already-granted purpose (no duplicate row).
//   3. Re-granting a previously-withdrawn purpose appends a fresh "granted" row.
//   4. The validator enforces the dot-lowercase taxonomy (UPPER_SNAKE is rejected),
//      matching the shared ConsentPurposes.CodePattern used by both grant and withdraw.
//
// Uses EF Core InMemory + a Moq'd ICurrentUser — no Postgres/Docker needed.

using AuthService.Application.Privacy.Commands.GrantConsent;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

[Trait("Category", "Unit")]
public sealed class GrantConsentCommandTests
{
    private static AuthDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static GrantConsentCommandHandler Handler(AuthDbContext db, Guid userId)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.Setup(u => u.UserId).Returns(userId);
        return new GrantConsentCommandHandler(db, currentUser.Object);
    }

    [Fact]
    public async Task Grant_WritesSingleGrantedRow_WithIpAndDescription()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();

        var result = await Handler(db, userId).Handle(
            new GrantConsentCommand("marketing.sms", "v1.0", "203.0.113.7", "UnitTest/1.0", "en"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var rows = await db.UserConsents.Where(c => c.UserId == userId && c.Purpose == "marketing.sms").ToListAsync();
        rows.Should().HaveCount(1);
        rows[0].Status.Should().Be("granted");
        rows[0].IpAddress.Should().Be("203.0.113.7");
        rows[0].PurposeDescription.Should().Be("SMS marketing messages about new features and offers.");
    }

    [Fact]
    public async Task Grant_IsIdempotent_WhenAlreadyGranted()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();
        var handler = Handler(db, userId);

        await handler.Handle(new GrantConsentCommand("analytics.usage", "v1.0", "10.0.0.1", null, "en"), CancellationToken.None);
        await handler.Handle(new GrantConsentCommand("analytics.usage", "v1.0", "10.0.0.1", null, "en"), CancellationToken.None);

        var rows = await db.UserConsents.Where(c => c.UserId == userId && c.Purpose == "analytics.usage").ToListAsync();
        rows.Should().HaveCount(1, "granting an already-granted purpose must not append a duplicate row");
    }

    [Fact]
    public async Task ReGrant_AfterWithdrawal_AppendsNewGrantedRow()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();

        db.UserConsents.Add(UserConsent.Grant(userId, "communication.whatsapp", "wa comms", "v1.0", "10.0.0.1", null, "en"));
        await db.SaveChangesAsync();
        db.UserConsents.Add(UserConsent.Withdraw(userId, "communication.whatsapp", "wa comms", "v1.0", "10.0.0.1", null, "en"));
        await db.SaveChangesAsync();

        var result = await Handler(db, userId).Handle(
            new GrantConsentCommand("communication.whatsapp", "v1.0", "10.0.0.1", null, "en"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var rows = await db.UserConsents
            .Where(c => c.UserId == userId && c.Purpose == "communication.whatsapp")
            .OrderBy(c => c.ActionAt).ToListAsync();
        rows.Should().HaveCount(3, "grant → withdraw → re-grant = 3 immutable rows");
        rows[^1].Status.Should().Be("granted", "the latest row after re-grant must be granted");
    }

    [Theory]
    [InlineData("marketing.sms", true)]
    [InlineData("loan.creditbureau", true)]
    [InlineData("MARKETING", false)]        // UPPER_SNAKE — the mismatch that returned 400
    [InlineData("ACCOUNT_MANAGEMENT", false)]
    [InlineData("Marketing.Sms", false)]
    public void Validator_EnforcesDotLowercaseTaxonomy(string purpose, bool expectedValid)
    {
        var validator = new GrantConsentCommandValidator();
        var result = validator.Validate(new GrantConsentCommand(purpose, "v1.0", null, null, "en"));
        result.IsValid.Should().Be(expectedValid);
    }
}
