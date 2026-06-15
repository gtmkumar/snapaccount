using AccountingService.Application.EditLog.Queries.ExportEditLog;
using AccountingService.Application.EditLog.Queries.GetEditLog;
using AccountingService.Application.Common.Interfaces;
using AccountingService.Domain.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Reflection;
using Xunit;

namespace AccountingService.Tests;

/// <summary>
/// Unit tests for the MCA edit-log read path (GAP-100 / migration 071).
///
/// Covers:
///   1. GetEditLogQuery returns rows filtered by org.
///   2. GetEditLogQuery filters by fyYear.
///   3. GetEditLogQuery filters by entityType.
///   4. GetEditLogQuery paginates correctly.
///   5. ExportEditLogQuery produces valid CSV with headers.
///   6. No org on user → Validation error.
///   7. GetEditLogQueryValidator rejects bad fyYear format.
///   8. ExportEditLogQueryValidator rejects missing fyYear.
///
/// Uses EF Core InMemory via a thin fake AccountingDbContext that only exposes EditLogs.
/// The GUC interceptor (McaEditLogGucInterceptor) is tested separately via integration tests.
/// </summary>
[Trait("Category", "Unit")]
public sealed class EditLogTests : IDisposable
{
    private readonly EditLogFakeDbContext _db;
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _otherOrgId = Guid.NewGuid();

    public EditLogTests()
    {
        var options = new DbContextOptionsBuilder<EditLogFakeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new EditLogFakeDbContext(options);
    }

    public void Dispose() => _db.Dispose();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Mock<ICurrentUser> MakeUser(Guid? orgId = null)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        mock.Setup(u => u.OrganizationId).Returns(orgId ?? _orgId);
        mock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(true);
        return mock;
    }

    private async Task SeedEditLogRowAsync(
        Guid orgId, string entityType = "journal_entry",
        string fyYear = "2026-27", Guid? changedBy = null)
    {
        var row = MakeEditLog(orgId, entityType, fyYear, changedBy ?? Guid.NewGuid());
        _db.EditLogs.Add(row);
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    private static AccountingService.Domain.Entities.EditLog MakeEditLog(
        Guid orgId, string entityType, string fyYear, Guid changedBy)
    {
        var log = (AccountingService.Domain.Entities.EditLog)
            System.Runtime.CompilerServices.RuntimeHelpers
            .GetUninitializedObject(typeof(AccountingService.Domain.Entities.EditLog));

        Set(log, "Id", Guid.NewGuid());
        Set(log, "OrgId", (Guid?)orgId);
        Set(log, "EntityType", entityType);
        Set(log, "EntityId", Guid.NewGuid());
        Set(log, "Operation", "INSERT");
        Set(log, "ChangedBy", (Guid?)changedBy);
        Set(log, "ChangedAt", DateTime.UtcNow);
        Set(log, "FyYear", fyYear);
        Set(log, "CreatedAt", DateTime.UtcNow);
        return log;
    }

    private static void Set(object obj, string propName, object? value)
    {
        var prop = obj.GetType().GetProperty(propName,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            ?? throw new InvalidOperationException($"Property '{propName}' not found on {obj.GetType().Name}");
        prop.SetValue(obj, value);
    }

    // ── GetEditLogQuery ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetEditLog_Returns_OrgScoped_Rows()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");
        await SeedEditLogRowAsync(_otherOrgId, fyYear: "2026-27"); // different org — must not appear

        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, null, 1, 50),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].FyYear.Should().Be("2026-27");
    }

    [Fact]
    public async Task GetEditLog_FiltersBy_FyYear()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");
        await SeedEditLogRowAsync(_orgId, fyYear: "2025-26");

        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery("2026-27", null, 1, 50),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].FyYear.Should().Be("2026-27");
    }

    [Fact]
    public async Task GetEditLog_FiltersBy_EntityType()
    {
        await SeedEditLogRowAsync(_orgId, entityType: "journal_entry");
        await SeedEditLogRowAsync(_orgId, entityType: "account");

        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, "account", 1, 50),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].EntityType.Should().Be("account");
    }

    [Fact]
    public async Task GetEditLog_Paginates_Correctly()
    {
        for (var i = 0; i < 5; i++)
            await SeedEditLogRowAsync(_orgId);

        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, null, 1, 2), // page 1, pageSize 2
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(5);
        result.Value.Items.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetEditLog_Page2_Returns_Next_Slice()
    {
        for (var i = 0; i < 5; i++)
            await SeedEditLogRowAsync(_orgId);

        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, null, 2, 2),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetEditLog_NoOrg_Returns_ValidationError()
    {
        var noOrgUser = new Mock<ICurrentUser>();
        noOrgUser.Setup(u => u.IsAuthenticated).Returns(true);
        noOrgUser.Setup(u => u.OrganizationId).Returns((Guid?)null);

        var handler = new GetEditLogQueryHandler(_db, noOrgUser.Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, null, 1, 50),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task GetEditLog_Empty_Org_Returns_EmptyPage()
    {
        var handler = new GetEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new GetEditLogQuery(null, null, 1, 50),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(0);
        result.Value.Items.Should().BeEmpty();
    }

    // ── ExportEditLogQuery ────────────────────────────────────────────────────

    [Fact]
    public async Task ExportEditLog_Produces_CSV_With_Headers()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");

        var handler = new ExportEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new ExportEditLogQuery("2026-27"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Csv.Should().StartWith("id,entity_type,entity_id,operation,changed_by,changed_at,fy_year");
    }

    [Fact]
    public async Task ExportEditLog_CSV_Contains_One_DataRow()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");

        var handler = new ExportEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new ExportEditLogQuery("2026-27"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var lines = result.Value.Csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        lines.Should().HaveCount(2, "header + 1 data row");
    }

    [Fact]
    public async Task ExportEditLog_FileName_Contains_FyYear()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");

        var handler = new ExportEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new ExportEditLogQuery("2026-27"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.FileName.Should().Contain("2026_27");
    }

    [Fact]
    public async Task ExportEditLog_ExcludesOtherOrg_Rows()
    {
        await SeedEditLogRowAsync(_orgId, fyYear: "2026-27");
        await SeedEditLogRowAsync(_otherOrgId, fyYear: "2026-27");

        var handler = new ExportEditLogQueryHandler(_db, MakeUser().Object);
        var result = await handler.Handle(
            new ExportEditLogQuery("2026-27"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var lines = result.Value.Csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        lines.Should().HaveCount(2, "header + 1 data row (cross-org row excluded)");
    }

    // ── Validators ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("2026-27")]
    [InlineData("2025-26")]
    public void GetEditLogQueryValidator_Valid_FyYear_Passes(string fyYear)
    {
        var validator = new GetEditLogQueryValidator();
        var result = validator.Validate(new GetEditLogQuery(fyYear, null, 1, 50));
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("202627")]
    [InlineData("AY2026-27")]
    [InlineData("26-27")]
    public void GetEditLogQueryValidator_Invalid_FyYear_Fails(string fyYear)
    {
        var validator = new GetEditLogQueryValidator();
        var result = validator.Validate(new GetEditLogQuery(fyYear, null, 1, 50));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void GetEditLogQueryValidator_NullFyYear_Passes()
    {
        var validator = new GetEditLogQueryValidator();
        var result = validator.Validate(new GetEditLogQuery(null, null, 1, 50));
        result.IsValid.Should().BeTrue("null fyYear is valid — optional filter");
    }

    [Fact]
    public void GetEditLogQueryValidator_InvalidEntityType_Fails()
    {
        var validator = new GetEditLogQueryValidator();
        var result = validator.Validate(new GetEditLogQuery(null, "bad_entity", 1, 50));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ExportEditLogQueryValidator_EmptyFyYear_Fails()
    {
        var validator = new ExportEditLogQueryValidator();
        var result = validator.Validate(new ExportEditLogQuery(""));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "FyYear");
    }

    [Fact]
    public void ExportEditLogQueryValidator_ValidFyYear_Passes()
    {
        var validator = new ExportEditLogQueryValidator();
        var result = validator.Validate(new ExportEditLogQuery("2026-27"));
        result.IsValid.Should().BeTrue();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal fake DbContext that only exposes EditLogs for unit-test isolation.
// Avoids depending on AccountingService.Infrastructure in unit tests.
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Lightweight fake DbContext satisfying <see cref="IAccountingDbContext"/>
/// for edit-log unit tests. Only the <c>EditLogs</c> DbSet is real;
/// all other DbSets throw if accessed (unit tests must not touch them).
/// </summary>
public sealed class EditLogFakeDbContext : DbContext, IAccountingDbContext
{
    public EditLogFakeDbContext(DbContextOptions<EditLogFakeDbContext> options) : base(options) { }

    // The only real DbSet for these tests
    public DbSet<AccountingService.Domain.Entities.EditLog> EditLogs => Set<AccountingService.Domain.Entities.EditLog>();

    // ── Unimplemented DbSets (throw if accessed — guards test isolation) ────
    DbSet<AccountingService.Domain.Entities.Account> IAccountingDbContext.Accounts
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.JournalEntry> IAccountingDbContext.JournalEntries
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.JournalEntryLine> IAccountingDbContext.JournalEntryLines
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.InternalAudit> IAccountingDbContext.InternalAudits
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.InternalAuditFinding> IAccountingDbContext.InternalAuditFindings
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.LedgerEntry> IAccountingDbContext.LedgerEntries
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.ChartOfAccount> IAccountingDbContext.ChartOfAccounts
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.JournalBatch> IAccountingDbContext.JournalBatches
        => throw new InvalidOperationException("Not used in edit-log tests.");
    DbSet<AccountingService.Domain.Entities.FiscalYearClose> IAccountingDbContext.FiscalYearCloses
        => throw new InvalidOperationException("Not used in edit-log tests.");

    Task<int> IAccountingDbContext.SaveChangesAsync(CancellationToken ct) => SaveChangesAsync(ct);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Minimal mapping for the InMemory test — just the EditLog entity.
        // No schema prefix needed for InMemory.
        modelBuilder.Entity<AccountingService.Domain.Entities.EditLog>(b =>
        {
            b.HasKey(e => e.Id);
            b.Property(e => e.EntityType).IsRequired();
            b.Property(e => e.EntityId).IsRequired();
            b.Property(e => e.Operation).IsRequired();
            b.Property(e => e.ChangedAt).IsRequired();
            b.Property(e => e.CreatedAt).IsRequired();
        });
    }
}
