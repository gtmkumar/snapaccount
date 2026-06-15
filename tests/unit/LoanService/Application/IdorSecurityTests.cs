using FluentAssertions;
using LoanService.Application.LoanApplications.Queries.GetApplication;
using LoanService.Application.LoanApplications.Queries.ListApplications;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace LoanService.Tests.Application;

/// <summary>
/// IDOR security tests: verifies that all query handlers enforce org-scoped filtering.
/// Uses in-memory EF Core DbContext to avoid requiring a running Postgres instance.
/// </summary>
public sealed class IdorSecurityTests
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
    public async Task GetApplication_CrossOrgRequest_ShouldReturnNotFound()
    {
        // Arrange: app owned by OtherOrgId
        await using var db = CreateDb();
        var app = new LoanApplication
        {
            OrgId = OtherOrgId,
            UserId = Guid.NewGuid(),
            LoanProductId = Guid.NewGuid(),
            RequestedAmount = 5_00_000m,
            TenureMonths = 24
        };
        db.LoanApplications.Add(app);
        await db.SaveChangesAsync();

        var currentUser = MockCurrentUser(CallerOrgId);
        var handler = new GetApplicationQueryHandler(db, currentUser);

        // Act: caller from CallerOrgId tries to access OtherOrgId's application
        var result = await handler.Handle(new GetApplicationQuery(app.Id), CancellationToken.None);

        // Assert: must return NotFound, not the data
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task GetApplication_SameOrgRequest_ShouldReturnData()
    {
        // Arrange: app owned by CallerOrgId
        await using var db = CreateDb();
        var product = new LoanProduct
        {
            BankId = Guid.NewGuid(),
            ProductName = "Test Product",
            MinAmount = 1_00_000m,
            MaxAmount = 50_00_00_000m,
            TenureMonths = 24,
            IsActive = true
        };
        db.LoanProducts.Add(product);

        var app = new LoanApplication
        {
            OrgId = CallerOrgId,
            UserId = Guid.NewGuid(),
            LoanProductId = product.Id,
            RequestedAmount = 5_00_000m,
            TenureMonths = 24
        };
        db.LoanApplications.Add(app);
        await db.SaveChangesAsync();

        var currentUser = MockCurrentUser(CallerOrgId);
        var handler = new GetApplicationQueryHandler(db, currentUser);

        var result = await handler.Handle(new GetApplicationQuery(app.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ApplicationId.Should().Be(app.Id);
    }

    [Fact]
    public async Task ListApplications_ShouldOnlyReturnCallerOrgApplications()
    {
        // Arrange: 2 apps for CallerOrgId, 1 for OtherOrgId
        await using var db = CreateDb();

        for (int i = 0; i < 2; i++)
        {
            db.LoanApplications.Add(new LoanApplication
            {
                OrgId = CallerOrgId,
                UserId = Guid.NewGuid(),
                LoanProductId = Guid.NewGuid(),
                RequestedAmount = 1_00_000m * (i + 1),
                TenureMonths = 12
            });
        }
        db.LoanApplications.Add(new LoanApplication
        {
            OrgId = OtherOrgId,
            UserId = Guid.NewGuid(),
            LoanProductId = Guid.NewGuid(),
            RequestedAmount = 9_99_000m,
            TenureMonths = 12
        });
        await db.SaveChangesAsync();

        var currentUser = MockCurrentUser(CallerOrgId);
        var handler = new ListApplicationsQueryHandler(db, currentUser);

        var result = await handler.Handle(new ListApplicationsQuery(null, 1, 50), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().AllSatisfy(a =>
            a.OrgId.Should().Be(CallerOrgId));
    }

    [Fact]
    public async Task GetApplication_NoOrgAssociated_ShouldReturnNotFound()
    {
        await using var db = CreateDb();
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.OrganizationId).Returns((Guid?)null);
        mock.Setup(u => u.IsAuthenticated).Returns(true);

        var handler = new GetApplicationQueryHandler(db, mock.Object);
        var result = await handler.Handle(new GetApplicationQuery(Guid.NewGuid()), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}

// ── In-memory DbContext for tests ─────────────────────────────────────────────

/// <summary>Minimal in-memory EF Core context that satisfies ILoanServiceDbContext for unit tests.</summary>
internal sealed class InMemoryLoanDbContext(DbContextOptions<InMemoryLoanDbContext> options)
    : DbContext(options), LoanService.Application.Common.Interfaces.ILoanServiceDbContext
{
    public DbSet<LoanApplication> LoanApplications { get; set; } = null!;
    public DbSet<LoanProduct> LoanProducts { get; set; } = null!;
    public DbSet<Consent> Consents { get; set; } = null!;
    public DbSet<PartnerBank> PartnerBanks { get; set; } = null!;
    public DbSet<ApplicationDocument> ApplicationDocuments { get; set; } = null!;
    public DbSet<ApplicationStatusLog> ApplicationStatusLogs { get; set; } = null!;
    public DbSet<LoanPdfPackage> LoanPdfPackages { get; set; } = null!;
    public DbSet<WebhookIdempotencyKey> WebhookIdempotencyKeys { get; set; } = null!;
    public DbSet<ConsentCatalogEntry> ConsentCatalog { get; set; } = null!;
    public DbSet<KeyFactsStatement> KeyFactsStatements { get; set; } = null!;
    public DbSet<FraudCheck> FraudChecks { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Minimal configuration for in-memory: convert enum properties to string
        modelBuilder.Entity<LoanApplication>().Property(a => a.Status).HasConversion<string>();
        modelBuilder.Entity<PartnerBank>().Property(b => b.AdapterType).HasConversion<string>();
        modelBuilder.Entity<FraudCheck>().Property(f => f.CheckType).HasConversion<string>();
        modelBuilder.Entity<FraudCheck>().Property(f => f.Verdict).HasConversion<string>();
        // Ignore JsonDocument properties — not supported by in-memory provider.
        // Also ignore the type globally so EF Core 10 ConstructorBindingConvention
        // does not attempt to discover it as a complex type during model finalization.
        modelBuilder.Ignore<System.Text.Json.JsonDocument>();
        modelBuilder.Entity<LoanProduct>().Ignore(p => p.EligibilityCriteriaJsonb);
        // Explicitly configure FK relationships so InMemory provider wires navigation properties
        modelBuilder.Entity<LoanApplication>()
            .HasOne(a => a.LoanProduct)
            .WithMany()
            .HasForeignKey(a => a.LoanProductId)
            .IsRequired(false);
        modelBuilder.Entity<LoanApplication>()
            .HasOne(a => a.AssignedBank)
            .WithMany()
            .HasForeignKey(a => a.AssignedBankId)
            .IsRequired(false);
        base.OnModelCreating(modelBuilder);
    }
}
