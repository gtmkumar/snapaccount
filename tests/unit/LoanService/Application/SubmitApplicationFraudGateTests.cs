// Unit tests: GAP-110 — fraud pre-submission gate on SubmitApplicationCommandHandler.
//
// The fraud pre-check (POST /loans/applications/{id}/fraud-check) persists FraudCheck rows.
// Submission enforces them:
//   1. EnforceOnSubmit=false + no fraud rows           → submit allowed (soft-launch default).
//   2. EnforceOnSubmit=true  + no fraud rows           → blocked (FraudCheckRequired).
//   3. Latest-verdict Fail (any flag value)            → blocked (FraudCheckFailed), always.
//   4. Older Fail superseded by newer Pass (same type) → submit allowed (legitimate resubmission).
//   5. Only Pass/Flag verdicts                         → submit allowed (flags never block).

using FluentAssertions;
using LoanService.Application.LoanApplications.Commands.SubmitApplication;
using LoanService.Application.Services;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace LoanService.Tests.Application;

// ────────────────────────────────────────────────────────────────────────────
// Test helpers (file-scoped — do not collide with other test files)
// ────────────────────────────────────────────────────────────────────────────

file static class FraudGateDb
{
    public static InMemoryLoanDbContext Create()
        => new(new DbContextOptionsBuilder<InMemoryLoanDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
}

file static class FraudGateCurrentUser
{
    public static ICurrentUser For(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.Permissions).Returns([]);
        mock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(false);
        return mock.Object;
    }
}

/// <summary>Minimal IFraudCheckConfig fake — only EnforceOnSubmit varies per test.</summary>
file sealed class FakeFraudConfig : IFraudCheckConfig
{
    public bool EnforceOnSubmit { get; init; }
    public int VelocityPanFlagThreshold => 3;
    public int VelocityPanFailThreshold => 5;
    public int VelocityPhoneFlagThreshold => 3;
    public int VelocityPhoneFailThreshold => 5;
    public int VelocityWindowDays => 30;
    public int DuplicatePanOrgThreshold => 2;
    public int DuplicatePhoneOrgThreshold => 2;
    public double PennyDropMinSimilarity => 0.80;
    public bool SuppressFlagInPackage => false;
}

[Trait("Category", "Unit")]
public sealed class SubmitApplicationFraudGateTests
{
    private static readonly ConsentType[] RequiredConsents =
        [ConsentType.CreditBureau, ConsentType.DataShareWithBank, ConsentType.DisbursementMandate];

    /// <summary>Seeds a Draft application with all 3 required consents and returns its id.</summary>
    private static async Task<Guid> SeedSubmittableApp(InMemoryLoanDbContext db, Guid orgId)
    {
        var app = new LoanApplication
        {
            OrgId = orgId,
            UserId = Guid.NewGuid(),
            LoanProductId = Guid.NewGuid(),
            RequestedAmount = 5_00_000m,
            TenureMonths = 24
        };
        db.LoanApplications.Add(app);

        foreach (var consentType in RequiredConsents)
        {
            db.Consents.Add(new Consent
            {
                ApplicationId = app.Id,
                ConsentType = consentType,
                ConsentTextVersion = "v1",
                ConsentLocale = "en",
                SignedAt = DateTime.UtcNow,
                SignatureHash = new byte[32]
            });
        }

        await db.SaveChangesAsync();
        return app.Id;
    }

    /// <summary>Builds a FraudCheck row with an explicit CheckedAt (private setter via reflection).</summary>
    private static FraudCheck FraudRow(Guid appId, FraudCheckType type, FraudVerdict verdict, DateTime checkedAt)
    {
        var fc = FraudCheck.Create(appId, type, verdict, $"{type}:{verdict}");
        typeof(FraudCheck).GetProperty(nameof(FraudCheck.CheckedAt))!.SetValue(fc, checkedAt);
        return fc;
    }

    private static SubmitApplicationCommandHandler Handler(InMemoryLoanDbContext db, Guid orgId, bool enforce)
        => new(db, FraudGateCurrentUser.For(orgId), new FakeFraudConfig { EnforceOnSubmit = enforce });

    [Fact]
    public async Task SoftLaunch_NoFraudChecks_AllowsSubmission()
    {
        var orgId = Guid.NewGuid();
        await using var db = FraudGateDb.Create();
        var appId = await SeedSubmittableApp(db, orgId);

        var result = await Handler(db, orgId, enforce: false)
            .Handle(new SubmitApplicationCommand(appId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("soft-launch default must not break existing submit flows");
        result.Value.Status.Should().Be(LoanApplicationStatus.Submitted.ToString());
    }

    [Fact]
    public async Task Enforced_NoFraudChecks_BlocksWithFraudCheckRequired()
    {
        var orgId = Guid.NewGuid();
        await using var db = FraudGateDb.Create();
        var appId = await SeedSubmittableApp(db, orgId);

        var result = await Handler(db, orgId, enforce: true)
            .Handle(new SubmitApplicationCommand(appId), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("LoanApplication.FraudCheckRequired");
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task LatestFailVerdict_AlwaysBlocks_EvenInSoftLaunch()
    {
        var orgId = Guid.NewGuid();
        await using var db = FraudGateDb.Create();
        var appId = await SeedSubmittableApp(db, orgId);
        db.FraudChecks.Add(FraudRow(appId, FraudCheckType.VelocityPan, FraudVerdict.Fail, DateTime.UtcNow));
        await db.SaveChangesAsync();

        var result = await Handler(db, orgId, enforce: false)
            .Handle(new SubmitApplicationCommand(appId), CancellationToken.None);

        result.IsFailure.Should().BeTrue("a Fail verdict on record must block regardless of the soft-launch flag");
        result.Error.Code.Should().Be("LoanApplication.FraudCheckFailed");
    }

    [Fact]
    public async Task OlderFail_SupersededByNewerPass_AllowsResubmission()
    {
        var orgId = Guid.NewGuid();
        await using var db = FraudGateDb.Create();
        var appId = await SeedSubmittableApp(db, orgId);
        var t0 = DateTime.UtcNow.AddMinutes(-10);
        db.FraudChecks.Add(FraudRow(appId, FraudCheckType.VelocityPan, FraudVerdict.Fail, t0));
        db.FraudChecks.Add(FraudRow(appId, FraudCheckType.VelocityPan, FraudVerdict.Pass, t0.AddMinutes(5)));
        await db.SaveChangesAsync();

        var result = await Handler(db, orgId, enforce: true)
            .Handle(new SubmitApplicationCommand(appId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("a newer Pass for the same check type supersedes the older Fail");
    }

    [Fact]
    public async Task OnlyFlagAndPassVerdicts_AllowsSubmission()
    {
        var orgId = Guid.NewGuid();
        await using var db = FraudGateDb.Create();
        var appId = await SeedSubmittableApp(db, orgId);
        var now = DateTime.UtcNow;
        db.FraudChecks.Add(FraudRow(appId, FraudCheckType.DuplicatePan, FraudVerdict.Flag, now));
        db.FraudChecks.Add(FraudRow(appId, FraudCheckType.VelocityPan, FraudVerdict.Pass, now));
        await db.SaveChangesAsync();

        var result = await Handler(db, orgId, enforce: true)
            .Handle(new SubmitApplicationCommand(appId), CancellationToken.None);

        result.IsSuccess.Should().BeTrue("FLAG verdicts annotate for review but never block submission");
    }
}
