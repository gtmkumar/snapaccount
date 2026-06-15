using GstService.Application.Ims.Commands.ApplyDeemedAcceptance;
using GstService.Infrastructure.Jobs;
using GstService.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Domain;

namespace GstService.Tests;

/// <summary>
/// Unit tests for <see cref="ImsDeemedAcceptanceJob"/>.
///
/// Verifies:
/// <list type="bullet">
///   <item>Job dispatches <see cref="ApplyDeemedAcceptanceCommand"/> once per distinct org with PENDING invoices.</item>
///   <item>Period is derived as the prior calendar month in MMYYYY format.</item>
///   <item>Job is a no-op when no PENDING/PENDING_KEPT invoices exist for the prior period.</item>
///   <item>Job continues processing other orgs when one org's command fails.</item>
/// </list>
/// </summary>
[Trait("Category", "Unit")]
public sealed class ImsDeemedAcceptanceJobTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    // ─── helpers ────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates an in-memory GstDbContext populated with seed data.
    /// Uses Npgsql in-memory provider (Microsoft.EntityFrameworkCore.InMemory).
    /// </summary>
    private static GstDbContext BuildInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<GstDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new GstDbContext(options);
    }

    private static ServiceProvider BuildServiceProvider(GstDbContext db, ISender sender)
    {
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton(sender);
        services.AddSingleton<GstDbContext>(_ => db);
        services.AddScoped<ISender>(_ => sender);
        services.AddTransient<ImsDeemedAcceptanceJob>(sp =>
            new ImsDeemedAcceptanceJob(
                sp.GetRequiredService<IServiceScopeFactory>(),
                NullLogger<ImsDeemedAcceptanceJob>.Instance));
        return services.BuildServiceProvider();
    }

    private static string PriorPeriod()
    {
        var priorMonth = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-1);
        return $"{priorMonth.Month:D2}{priorMonth.Year}";
    }

    // ─── tests ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task RunAsync_WithPendingInvoices_DispatchesCommandPerOrg()
    {
        // Arrange
        var period = PriorPeriod();
        var org1 = Guid.NewGuid();
        var org2 = Guid.NewGuid();

        var db = BuildInMemoryDb();
        // Add 2 pending invoices for org1 and 1 for org2 in the prior period.
        db.ImsInvoices.AddRange(
            CreatePendingInvoice(org1, period),
            CreatePendingInvoice(org1, period, "INV-002"),
            CreatePendingInvoice(org2, period));
        await db.SaveChangesAsync();

        var senderMock = new Mock<ISender>();
        senderMock
            .Setup(s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ApplyDeemedAcceptanceCommand cmd, CancellationToken _) =>
                Result<ApplyDeemedAcceptanceResponse>.Success(
                    new ApplyDeemedAcceptanceResponse(1, cmd.Period, cmd.OrganizationId)));

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act
        await job.RunAsync();

        // Assert — one command per distinct org.
        senderMock.Verify(
            s => s.Send(It.Is<ApplyDeemedAcceptanceCommand>(c =>
                c.OrganizationId == org1 && c.Period == period),
                It.IsAny<CancellationToken>()),
            Times.Once,
            "should dispatch deemed-acceptance for org1");

        senderMock.Verify(
            s => s.Send(It.Is<ApplyDeemedAcceptanceCommand>(c =>
                c.OrganizationId == org2 && c.Period == period),
                It.IsAny<CancellationToken>()),
            Times.Once,
            "should dispatch deemed-acceptance for org2");

        senderMock.Verify(
            s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()),
            Times.Exactly(2),
            "total command dispatches should match distinct org count");
    }

    [Fact]
    public async Task RunAsync_NoPendingInvoices_DispatchesNoCommands()
    {
        // Arrange — no invoices at all
        var db = BuildInMemoryDb();
        var senderMock = new Mock<ISender>();

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act
        await job.RunAsync();

        // Assert — no commands dispatched
        senderMock.Verify(
            s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task RunAsync_OnlyCurrentPeriodInvoices_NotCurrentPeriod_Skips()
    {
        // Arrange — invoices exist only for the CURRENT month (not the prior period the job targets)
        var db = BuildInMemoryDb();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var currentPeriod = $"{today.Month:D2}{today.Year}"; // current month, not prior

        db.ImsInvoices.Add(CreatePendingInvoice(Guid.NewGuid(), currentPeriod));
        await db.SaveChangesAsync();

        var senderMock = new Mock<ISender>();

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act
        await job.RunAsync();

        // Assert — no commands dispatched (wrong period)
        senderMock.Verify(
            s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "invoices for the current month should not be swept until next month's run");
    }

    [Fact]
    public async Task RunAsync_PendingKeptInvoice_IsIncluded()
    {
        // PENDING_KEPT invoices are also subject to deemed acceptance per GSTN rules.
        var period = PriorPeriod();
        var orgId = Guid.NewGuid();

        var db = BuildInMemoryDb();
        var invoice = CreatePendingKeptInvoice(orgId, period);
        db.ImsInvoices.Add(invoice);
        await db.SaveChangesAsync();

        var senderMock = new Mock<ISender>();
        senderMock
            .Setup(s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ApplyDeemedAcceptanceCommand cmd, CancellationToken _) =>
                Result<ApplyDeemedAcceptanceResponse>.Success(
                    new ApplyDeemedAcceptanceResponse(1, cmd.Period, cmd.OrganizationId)));

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act
        await job.RunAsync();

        // Assert — PENDING_KEPT org is included
        senderMock.Verify(
            s => s.Send(It.Is<ApplyDeemedAcceptanceCommand>(c =>
                c.OrganizationId == orgId && c.Period == period),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunAsync_CommandFailsForOneOrg_ContinuesWithOtherOrgs()
    {
        // Arrange — two orgs; org1 command fails, org2 should still be processed.
        var period = PriorPeriod();
        var org1 = Guid.NewGuid();
        var org2 = Guid.NewGuid();

        var db = BuildInMemoryDb();
        db.ImsInvoices.AddRange(
            CreatePendingInvoice(org1, period),
            CreatePendingInvoice(org2, period));
        await db.SaveChangesAsync();

        var senderMock = new Mock<ISender>();
        senderMock
            .Setup(s => s.Send(
                It.Is<ApplyDeemedAcceptanceCommand>(c => c.OrganizationId == org1),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<ApplyDeemedAcceptanceResponse>.Failure(
                new Error("Test.Failure", "Simulated transient error")));

        senderMock
            .Setup(s => s.Send(
                It.Is<ApplyDeemedAcceptanceCommand>(c => c.OrganizationId == org2),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<ApplyDeemedAcceptanceResponse>.Success(
                new ApplyDeemedAcceptanceResponse(1, period, org2)));

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act — should not throw even when one org fails
        var act = async () => await job.RunAsync();
        await act.Should().NotThrowAsync();

        // Assert — org2 still processed despite org1 failure
        senderMock.Verify(
            s => s.Send(It.Is<ApplyDeemedAcceptanceCommand>(c => c.OrganizationId == org2),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunAsync_AlreadyAcceptedInvoices_NotIncluded()
    {
        // Arrange — only ACCEPTED invoices for the period; no PENDING ones.
        var period = PriorPeriod();
        var orgId = Guid.NewGuid();

        var db = BuildInMemoryDb();
        var invoice = CreateAcceptedInvoice(orgId, period);
        db.ImsInvoices.Add(invoice);
        await db.SaveChangesAsync();

        var senderMock = new Mock<ISender>();

        var job = new ImsDeemedAcceptanceJob(
            BuildScopeFactory(db, senderMock.Object),
            NullLogger<ImsDeemedAcceptanceJob>.Instance);

        // Act
        await job.RunAsync();

        // Assert — no commands because there are no PENDING/PENDING_KEPT invoices
        senderMock.Verify(
            s => s.Send(It.IsAny<ApplyDeemedAcceptanceCommand>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "already-ACCEPTED invoices are not included in the deemed-acceptance sweep");
    }

    // ─── factory helpers ─────────────────────────────────────────────────────

    private static IServiceScopeFactory BuildScopeFactory(GstDbContext db, ISender sender)
    {
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddScoped<GstDbContext>(_ => db);
        services.AddScoped<ISender>(_ => sender);
        var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IServiceScopeFactory>();
    }

    private static GstService.Domain.Entities.ImsInvoice CreatePendingInvoice(
        Guid orgId, string period, string invoiceNumber = "INV-001")
        => GstService.Domain.Entities.ImsInvoice.Create(
            organizationId: orgId,
            supplierGstin: "27AABCU9603R1ZX",
            supplierName: "Test Supplier",
            invoiceNumber: invoiceNumber,
            invoiceDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-1)),
            invoiceValue: 11800m,
            taxableValue: 10000m,
            igstAmount: 1800m,
            cgstAmount: 0m,
            sgstAmount: 0m,
            cessAmount: 0m,
            period: period,
            source: "GSTR-1");

    private static GstService.Domain.Entities.ImsInvoice CreatePendingKeptInvoice(
        Guid orgId, string period)
    {
        var inv = CreatePendingInvoice(orgId, period, "INV-PK");
        inv.KeepPending(Guid.NewGuid());
        return inv;
    }

    private static GstService.Domain.Entities.ImsInvoice CreateAcceptedInvoice(
        Guid orgId, string period)
    {
        var inv = CreatePendingInvoice(orgId, period, "INV-ACC");
        inv.Accept(Guid.NewGuid());
        return inv;
    }
}
