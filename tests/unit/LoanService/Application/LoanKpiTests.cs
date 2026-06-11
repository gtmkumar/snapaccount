using FluentAssertions;
using LoanService.Application.Dashboard.Queries.GetLoanKpi;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using Xunit;

namespace LoanService.Tests.Application;

/// <summary>
/// Tests for GET /loans/kpi (WEB-FIX: endpoint was returning 404).
/// Verifies org-scoped KPI counts match expected values per status.
/// </summary>
[Trait("Category", "Unit")]
public sealed class LoanKpiTests
{
    private static readonly Guid CallerOrgId = Guid.NewGuid();
    private static readonly Guid OtherOrgId = Guid.NewGuid();

    private static InMemoryLoanDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<InMemoryLoanDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new InMemoryLoanDbContext(options);
    }

    private static ICurrentUser MockCurrentUser(Guid orgId)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns(orgId);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        return mock.Object;
    }

    [Fact]
    public async Task GetLoanKpi_ReturnsOrgScopedCountsByStatus()
    {
        await using var db = CreateDb();
        var productId = Guid.NewGuid();

        // Create loans with statuses set before adding to EF context.
        var app1 = new LoanApplication { OrgId = CallerOrgId, LoanProductId = productId, RequestedAmount = 100000m, TenureMonths = 12 };
        var app2 = new LoanApplication { OrgId = CallerOrgId, LoanProductId = productId, RequestedAmount = 200000m, TenureMonths = 24 };
        var app3 = new LoanApplication { OrgId = CallerOrgId, LoanProductId = productId, RequestedAmount = 300000m, TenureMonths = 36 };
        var appOther = new LoanApplication { OrgId = OtherOrgId, LoanProductId = productId, RequestedAmount = 50000m, TenureMonths = 6 };

        // Set specific statuses via reflection (bypass state machine for test setup).
        EFCoreStatusHelper.SetStatus(app1, LoanApplicationStatus.Submitted);
        EFCoreStatusHelper.SetStatus(app2, LoanApplicationStatus.UnderReview);
        EFCoreStatusHelper.SetStatus(app3, LoanApplicationStatus.Approved);

        db.LoanApplications.AddRange(app1, app2, app3, appOther);
        await db.SaveChangesAsync(CancellationToken.None);

        var handler = new GetLoanKpiQueryHandler(db, MockCurrentUser(CallerOrgId));

        // Act
        var result = await handler.Handle(new GetLoanKpiQuery(), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.TotalApps.Should().Be(3, "only CallerOrgId apps counted");
        result.Value.Submitted.Should().Be(1);
        result.Value.UnderReview.Should().Be(1);
        result.Value.Approved.Should().Be(1);
        result.Value.AwaitingDocs.Should().Be(0);
        result.Value.Disbursed.Should().Be(0);
    }

    [Fact]
    public async Task GetLoanKpi_EmptyOrg_ReturnsZeroCounts()
    {
        await using var db = CreateDb();
        var handler = new GetLoanKpiQueryHandler(db, MockCurrentUser(CallerOrgId));

        var result = await handler.Handle(new GetLoanKpiQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalApps.Should().Be(0);
        result.Value.Submitted.Should().Be(0);
    }

    [Fact]
    public async Task GetLoanKpi_MissingOrg_ReturnsValidationFailure()
    {
        await using var db = CreateDb();
        var currentUser = new Mock<ICurrentUser>();
        currentUser.Setup(u => u.OrganizationId).Returns((Guid?)null);
        currentUser.Setup(u => u.IsAuthenticated).Returns(true);

        var handler = new GetLoanKpiQueryHandler(db, currentUser.Object);

        var result = await handler.Handle(new GetLoanKpiQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("Loan.MissingOrg");
    }
}

/// <summary>Helper to set LoanApplicationStatus via reflection for test setup (bypasses state machine).</summary>
internal static class EFCoreStatusHelper
{
    public static void SetStatus(LoanApplication app, LoanApplicationStatus status)
    {
        var prop = typeof(LoanApplication).GetProperty(nameof(LoanApplication.Status));
        var setter = prop!.GetSetMethod(nonPublic: true);
        setter!.Invoke(app, [status]);
    }
}
