// Unit tests: GetMyConsentsQuery additive DTO alignment (Task 2 — consent field renaming).
//
// Background: mobile/src/api/privacy.ts normalizeConsent() previously needed to translate
// backend field names (purpose/purposeDescription/noticeVersion/actionAt) to mobile-contract
// names (purposeCode/description/consentTextVersion/grantedAt). The GetMyConsentsResult
// and ConsentEntry DTOs now expose BOTH sets of names additively, so:
//   1. Existing admin client (which reads old names) is unaffected.
//   2. Mobile can read aligned names directly without normalizer translation.
//   3. Envelope includes both 'consents' and 'items' keys.
//
// Tests verify:
//   A. ConsentEntry alias properties return the same values as originals
//   B. GetMyConsentsResult.Items alias returns same list as .Consents
//   C. Handler still returns correct data (no regression from DTO changes)
//   D. Status mapping is stable (handler reads Status from entity string, not new alias)

using AuthService.Application.Common.Interfaces;
using AuthService.Application.Privacy.Queries.GetMyConsents;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace AuthService.Tests;

[Trait("Category", "Unit")]
public sealed class ConsentDtoAlignmentTests
{
    // ── A. ConsentEntry alias properties ─────────────────────────────────────

    [Fact]
    public void ConsentEntry_PurposeCode_AliasesPurpose()
    {
        var entry = new ConsentEntry("marketing.sms", "SMS marketing", "granted", "v1.2", DateTime.UtcNow, "en");
        entry.PurposeCode.Should().Be(entry.Purpose, "PurposeCode is an alias for Purpose");
    }

    [Fact]
    public void ConsentEntry_Description_AliasesPurposeDescription()
    {
        var entry = new ConsentEntry("analytics", "Usage analytics data", "granted", "v2.0", DateTime.UtcNow, "hi");
        entry.Description.Should().Be(entry.PurposeDescription, "Description is an alias for PurposeDescription");
    }

    [Fact]
    public void ConsentEntry_ConsentTextVersion_AliasesNoticeVersion()
    {
        var entry = new ConsentEntry("data.share", "Data sharing with banks", "granted", "notice-v3", DateTime.UtcNow, "en");
        entry.ConsentTextVersion.Should().Be(entry.NoticeVersion, "ConsentTextVersion is an alias for NoticeVersion");
    }

    [Fact]
    public void ConsentEntry_GrantedAt_AliasesActionAt()
    {
        var actionAt = new DateTime(2025, 10, 15, 9, 30, 0, DateTimeKind.Utc);
        var entry = new ConsentEntry("communication.email", "Email comms", "granted", "v1", actionAt, "en");
        entry.GrantedAt.Should().Be(entry.ActionAt, "GrantedAt is an alias for ActionAt");
        entry.GrantedAt.Should().Be(actionAt);
    }

    [Fact]
    public void ConsentEntry_AllOriginalFields_AreStillAccessible()
    {
        // Regression guard: original fields must not be broken by the additive changes
        var at = DateTime.UtcNow;
        var entry = new ConsentEntry("loan.credit_bureau", "Credit bureau enquiry", "granted", "v4.1", at, "hi");

        entry.Purpose.Should().Be("loan.credit_bureau");
        entry.PurposeDescription.Should().Be("Credit bureau enquiry");
        entry.Status.Should().Be("granted");
        entry.NoticeVersion.Should().Be("v4.1");
        entry.ActionAt.Should().Be(at);
        entry.Locale.Should().Be("hi");
    }

    // ── B. GetMyConsentsResult Items alias ────────────────────────────────────

    [Fact]
    public void GetMyConsentsResult_Items_AliasesConsents()
    {
        var entries = new List<ConsentEntry>
        {
            new("marketing.sms", "SMS", "granted", "v1", DateTime.UtcNow, "en"),
            new("analytics", "Analytics", "withdrawn", "v2", DateTime.UtcNow, "en"),
        };
        var result = new GetMyConsentsResult(entries);

        result.Items.Should().BeSameAs(result.Consents, "Items is an alias for Consents list — same reference");
        result.Items.Should().HaveCount(2);
    }

    [Fact]
    public void GetMyConsentsResult_EmptyConsents_ItemsIsAlsoEmpty()
    {
        var result = new GetMyConsentsResult([]);
        result.Items.Should().BeEmpty();
        result.Consents.Should().BeEmpty();
    }

    // ── C. Handler still returns correct data ─────────────────────────────────

    [Fact]
    public async Task Handler_WithSeededConsents_AliasFieldsMatchOriginals()
    {
        // Build an in-memory DB, seed a consent, run handler, verify DTO aliases
        var opts = new DbContextOptionsBuilder<AuthDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new AuthDbContext(opts);

        var userId = Guid.NewGuid();
        db.UserConsents.Add(
            UserConsent.Grant(userId, "marketing.sms", "SMS marketing", "v1.0", null, null, "en"));
        await db.SaveChangesAsync();

        var currentUser = new Mock<ICurrentUser>();
        currentUser.Setup(u => u.UserId).Returns(userId);

        var handler = new GetMyConsentsQueryHandler(db, currentUser.Object);
        var result = await handler.Handle(new GetMyConsentsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Consents.Should().HaveCount(1);

        var entry = result.Value.Consents[0];

        // Alias verification — every aligned field must equal its canonical original
        entry.PurposeCode.Should().Be(entry.Purpose);
        entry.Description.Should().Be(entry.PurposeDescription);
        entry.ConsentTextVersion.Should().Be(entry.NoticeVersion);
        entry.GrantedAt.Should().Be(entry.ActionAt);

        // Envelope alias
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Should().Be(result.Value.Consents[0]);
    }

    // ── D. Status mapping stability ───────────────────────────────────────────

    [Fact]
    public void ConsentEntry_WithdrawnStatus_IsPassedThrough()
    {
        var entry = new ConsentEntry("analytics", "Analytics", "withdrawn", "v1", DateTime.UtcNow, "en");
        // Status is a raw string from the entity — handler passes it directly; mobile uppercases on compare
        entry.Status.Should().Be("withdrawn");
        // None of the alias properties should interfere with Status
        entry.PurposeCode.Should().Be("analytics");
    }

    [Theory]
    [InlineData("granted")]
    [InlineData("withdrawn")]
    public void ConsentEntry_StatusValues_PreservedVerbatim(string status)
    {
        var entry = new ConsentEntry("p", "desc", status, "v1", DateTime.UtcNow, "en");
        entry.Status.Should().Be(status, "status value is never transformed by ConsentEntry");
    }
}
