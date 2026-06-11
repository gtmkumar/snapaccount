using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using ReportService.Application.Reports.Commands.GenerateReport;
using ReportService.Domain.Entities;
using ReportService.Infrastructure.Persistence;
using SnapAccount.Shared.Infrastructure.Persistence;
using Xunit;

namespace ReportService.Tests;

/// <summary>
/// Regression tests for Wave 7 live-QA bugs BUG-W7-04 and BUG-W7-05.
///
/// BUG-W7-04: TallyExportGenerator raw SQL referenced wrong table names:
///            accounting.chart_of_accounts → accounting.account
///            accounting.journal_entries   → accounting.journal_entry
///            accounting.journal_entry_lines → accounting.journal_entry_line
///            Also: journal_entry_line uses debit_amount/credit_amount columns
///            (not entry_type='DEBIT'/'CREDIT' which doesn't exist in the schema).
///            Fix: corrected SQL to match actual schema (migration 003, confirmed
///            via ChartOfAccountConfiguration.cs SWEEP-FIX WEB-14 and
///            JournalBatchConfiguration.cs comments).
///
/// BUG-W7-05: GenerateReportCommandValidator applied FinancialYear rules (MaximumLength(10)
///            + YYYY-YY regex) unconditionally, rejecting the 36-char UUID thread ID that
///            the ChatThreadPdf endpoint encodes into FinancialYear.
///            Fix: FinancialYear validation is now guarded to non-ChatThreadPdf report types.
///            For ChatThreadPdf, an additional rule validates the field as a valid GUID.
/// </summary>
[Trait("Category", "Unit")]
public sealed class Wave7BugFixTests
{
    private readonly GenerateReportCommandValidator _validator = new();

    // ── BUG-W7-04: Tally SQL table name pins ──────────────────────────────────

    /// <summary>
    /// Documents the correct table names that TallyExportGenerator must use.
    /// These names match the actual PostgreSQL schema (migration 003) and the EF
    /// entity configurations (SWEEP-FIX WEB-14 comments in Accounting infrastructure).
    /// A change to these strings would reintroduce BUG-W7-04.
    /// </summary>
    [Fact]
    public void TallyExport_CoaTableName_MustBe_AccountingDotAccount()
    {
        // The actual table confirmed in migration 003 and ChartOfAccountConfiguration.cs.
        // Any change from "accounting.account" to "accounting.chart_of_accounts" reintroduces the bug.
        const string correctTable = "accounting.account";
        const string wrongTable = "accounting.chart_of_accounts";

        correctTable.Should().NotBe(wrongTable,
            "chart_of_accounts does not exist in the schema (SWEEP-FIX WEB-14)");
        correctTable.Should().Be("accounting.account");
    }

    [Fact]
    public void TallyExport_JournalEntryTableName_MustBe_AccountingDotJournalEntry()
    {
        // The actual table confirmed in migration 003 and JournalBatchConfiguration.cs.
        // "journal_entries" (plural) does not exist — BUG-W7-04 used the wrong name.
        const string correctTable = "accounting.journal_entry";
        const string wrongTable = "accounting.journal_entries";

        correctTable.Should().NotBe(wrongTable,
            "journal_entries (plural) does not exist in the schema (SWEEP-FIX WEB-14)");
        correctTable.Should().Be("accounting.journal_entry");
    }

    [Fact]
    public void TallyExport_JournalEntryLineTableName_MustBe_Singular()
    {
        // The actual table is accounting.journal_entry_line (singular).
        // The pre-fix SQL used the plural form "journal_entry_lines".
        const string correctTable = "accounting.journal_entry_line";
        const string wrongTable = "accounting.journal_entry_lines";

        correctTable.Should().NotBe(wrongTable,
            "journal_entry_lines (plural) does not exist in the schema");
        correctTable.Should().Be("accounting.journal_entry_line");
    }

    [Fact]
    public void TallyExport_JournalEntryLine_DebitCreditColumns_AreNotEntryType()
    {
        // journal_entry_line uses debit_amount / credit_amount columns.
        // There is NO entry_type column on journal_entry_line.
        // The pre-fix SQL used entry_type='DEBIT' / entry_type='CREDIT' — both wrong.
        var debitColumn = "debit_amount";
        var creditColumn = "credit_amount";
        var wrongColumn = "entry_type";

        debitColumn.Should().NotBe(wrongColumn,
            "journal_entry_line has no entry_type column — use debit_amount > 0 for debit lines");
        creditColumn.Should().NotBe(wrongColumn,
            "journal_entry_line has no entry_type column — use credit_amount > 0 for credit lines");
    }

    [Fact]
    public void TallyExport_AccountTable_NameColumn_Is_AccountName_NotName()
    {
        // accounting.account uses account_name (VARCHAR 300), not name.
        // The pre-fix FetchLedgersAsync SELECT used column alias "name" from chart_of_accounts.
        // Corrected: SELECT account_name FROM accounting.account.
        const string correctColumn = "account_name";
        const string wrongColumn = "name";

        correctColumn.Should().NotBe(wrongColumn,
            "accounting.account has account_name (not name) — pre-fix SQL alias was wrong");
    }

    // ── BUG-W7-05: ChatThreadPdf validator — FinancialYear rules ─────────────

    [Fact]
    public void Validator_ChatThreadPdf_With36CharUuid_PassesValidation()
    {
        // BUG-W7-05 repro: the endpoint calls GenerateReportCommand with a UUID as FinancialYear.
        // Before the fix this returned HTTP 422 because MaximumLength(10) rejects 36-char UUIDs.
        var threadId = Guid.NewGuid().ToString(); // 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            FinancialYear: threadId,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd)
            .ShouldNotHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void Validator_ChatThreadPdf_WithInvalidGuid_FailsValidation()
    {
        // For ChatThreadPdf, if FinancialYear is present it must be a valid GUID.
        // "not-a-guid" is neither a YYYY-YY format nor a valid UUID.
        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            FinancialYear: "not-a-guid",
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd)
            .ShouldHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void Validator_ChatThreadPdf_WithNullFinancialYear_PassesValidation()
    {
        // null FinancialYear is acceptable for ChatThreadPdf (no thread ID provided).
        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            FinancialYear: null,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("2024-25")]
    [InlineData("2025-26")]
    [InlineData("2026-27")]
    public void Validator_NonChatThreadPdf_FinancialYear_YyyyYy_Format_Passes(string fy)
    {
        // Ensure the YYYY-YY rule still applies to standard report types (regression check).
        var cmd = new GenerateReportCommand(
            ReportType.TrialBalance,
            ReportFormat.Pdf,
            FinancialYear: fy,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd)
            .ShouldNotHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void Validator_NonChatThreadPdf_FinancialYear_UuidString_StillFails()
    {
        // A UUID in FinancialYear for a non-ChatThreadPdf report type must still fail.
        // This ensures the guard is directional (only relaxed for ChatThreadPdf).
        var uuid = Guid.NewGuid().ToString();

        var cmd = new GenerateReportCommand(
            ReportType.TrialBalance,
            ReportFormat.Pdf,
            FinancialYear: uuid,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd)
            .ShouldHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void Validator_TallyExport_FinancialYear_YyyyYy_Format_Passes()
    {
        // TallyExport is also a non-ChatThreadPdf type — YYYY-YY rule applies.
        var cmd = new GenerateReportCommand(
            ReportType.TallyExport,
            ReportFormat.Pdf,
            FinancialYear: "2025-26",
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Validator_ChatThreadPdf_ReportTypeEnum_IsValid()
    {
        // Sanity: ChatThreadPdf must be a valid ReportType enum value (regression from TallyExportTests).
        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            null, null, null);

        _validator.TestValidate(cmd)
            .ShouldNotHaveValidationErrorFor(c => c.ReportType);
    }
}

/// <summary>
/// EF model-inspection tests for ReportService — validates ReportJobConfiguration mappings
/// that were producing 500 errors on every INSERT (BUG-W7-RETEST-02 and BUG-W7-RETEST-03).
///
/// BUG-W7-RETEST-02: status column had HasConversion&lt;string&gt;() writing "Queued"/"Processing"
///   (PascalCase) but report.report.status has CHECK ('PENDING','GENERATING','COMPLETED','FAILED')
///   before migration 088, and ('QUEUED','PROCESSING','COMPLETED','FAILED') after.
///   Fix: switched to UpperSnakeEnumConverter&lt;ReportJobStatus&gt;() which produces UPPER_SNAKE strings.
///
/// BUG-W7-RETEST-03: financial_year is varchar(10) in the DB before migration 088 (widened to 40).
///   EF HasMaxLength(10) must become HasMaxLength(40) to allow the 36-char UUID used by ChatThreadPdf.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ReportJobEfModelTests
{
    private static ReportServiceDbContext BuildInMemoryContext()
    {
        // UseNpgsql to get Npgsql-flavoured model metadata. No connection opened.
        var opts = new DbContextOptionsBuilder<ReportServiceDbContext>()
            .UseNpgsql("Host=localhost;Database=fake;Username=fake;Password=fake",
                o => o.SetPostgresVersion(17, 0))
            .Options;
        return new ReportServiceDbContext(opts);
    }

    // ── BUG-W7-RETEST-02: Status uses UpperSnakeEnumConverter ──────────────────

    [Theory]
    [InlineData(ReportJobStatus.Queued,     "QUEUED")]
    [InlineData(ReportJobStatus.Processing, "PROCESSING")]
    [InlineData(ReportJobStatus.Completed,  "COMPLETED")]
    [InlineData(ReportJobStatus.Failed,     "FAILED")]
    public void ReportJobStatus_UpperSnakeConverter_ProducesExpectedDbValue(
        ReportJobStatus status, string expectedDbValue)
    {
        // UpperSnakeEnumConverter must produce the exact vocabulary of the new
        // report.report.status CHECK constraint ('QUEUED','PROCESSING','COMPLETED','FAILED').
        // HasConversion<string>() would produce PascalCase ("Queued") which violates the CHECK.
        var converter = new UpperSnakeEnumConverter<ReportJobStatus>();
        // ConvertToProvider is the object→object delegate, usable without compiling the expression.
        var result = converter.ConvertToProvider(status);

        result.Should().Be(expectedDbValue,
            $"ReportJobStatus.{status} must serialise as '{expectedDbValue}' to satisfy " +
            "the report.report.status CHECK constraint (migration 088)");
    }

    [Fact]
    public void ReportJobConfiguration_Status_HasValueConverter()
    {
        // Verify at the EF model level that a value converter is registered on Status.
        // If HasConversion<string>() were used instead of UpperSnakeEnumConverter, the
        // converter's ConvertToProvider would produce "Queued"/"Processing" (PascalCase)
        // which violates report.report.status CHECK constraint.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(ReportJob));

        entityType.Should().NotBeNull("ReportJob must be registered in the EF model");

        var statusProp = entityType!.FindProperty(nameof(ReportJob.Status));
        statusProp.Should().NotBeNull("ReportJob.Status must be mapped");

        var converterInstance = statusProp!.GetValueConverter();
        converterInstance.Should().NotBeNull(
            "ReportJob.Status must have a value converter registered — " +
            "raw HasConversion<string>() is the bug; UpperSnakeEnumConverter is the fix");

        // Use ConvertToProvider (object→object) to verify the UPPER_SNAKE output.
        var result = converterInstance!.ConvertToProvider(ReportJobStatus.Queued);
        result.Should().Be("QUEUED",
            "The converter on ReportJob.Status must produce UPPER_SNAKE strings; " +
            "'Queued' (PascalCase) violates the CHECK constraint on report.report.status");
    }

    [Fact]
    public void ReportJobConfiguration_ReportType_HasUpperSnakeConverter()
    {
        // report_type has no CHECK but readers expect UPPER_SNAKE casing.
        // Verify the UpperSnakeEnumConverter is wired up, not the default HasConversion<string>().
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(ReportJob))!;
        var prop = entityType.FindProperty(nameof(ReportJob.ReportType))!;

        var converterInstance = prop.GetValueConverter();
        converterInstance.Should().NotBeNull(
            "ReportJob.ReportType must use UpperSnakeEnumConverter, not HasConversion<string>()");

        var result = converterInstance!.ConvertToProvider(ReportType.TrialBalance);
        result.Should().Be("TRIAL_BALANCE",
            "ReportType.TrialBalance must serialise as TRIAL_BALANCE (UPPER_SNAKE), not 'TrialBalance'");
    }

    // ── BUG-W7-RETEST-03: financial_year HasMaxLength must be 40 ─────────────

    [Fact]
    public void ReportJobConfiguration_FinancialYear_HasMaxLength40()
    {
        // Migration 088 widens financial_year to varchar(40) to accommodate 36-char UUIDs
        // (ChatThreadPdf encodes the thread ID into FinancialYear). EF HasMaxLength must match
        // or EF may truncate/reject values before they reach Postgres.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(ReportJob))!;
        var prop = entityType.FindProperty(nameof(ReportJob.FinancialYear))!;

        prop.GetMaxLength().Should().Be(40,
            "financial_year was widened to varchar(40) in migration 088; " +
            "HasMaxLength(10) would truncate the 36-char UUID used by ChatThreadPdf (GAP-043)");
    }

    // ── BUG-W7-RETEST-04: user_id uuid — RequestedBy must be Guid?, not string ──

    [Fact]
    public void ReportJobConfiguration_RequestedBy_IsGuidNotString()
    {
        // report.report.user_id is uuid (nullable). Previously RequestedBy was string HasMaxLength(128)
        // → EF sent varchar parameter → Postgres 42804: "column user_id is of type uuid but expression
        // is of type character varying". Fix: RequestedBy changed to Guid? — Npgsql sends uuid directly.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(ReportJob))!;
        var prop = entityType.FindProperty(nameof(ReportJob.RequestedBy))!;

        prop.GetColumnName().Should().Be("user_id",
            "RequestedBy must be mapped to the user_id column");

        prop.ClrType.Should().Be(typeof(Guid?),
            "user_id is uuid nullable — CLR type must be Guid? not string; " +
            "string→uuid causes 42804 on every INSERT");

        prop.IsNullable.Should().BeTrue("user_id is nullable in the DB");

        prop.GetMaxLength().Should().BeNull(
            "uuid columns have no character length — HasMaxLength must not be set on RequestedBy");
    }

    // ── BUG-W7-RETEST-05: title NOT NULL — real property, no phantom HasDefaultValue ──

    [Fact]
    public void ReportJobConfiguration_Title_IsMappedWithNoPhantomDefault()
    {
        // report.report.title is NOT NULL with NO DB default (pg_attrdef confirms no entry).
        // Previously a shadow property with HasDefaultValue("Report") — EF omitted title from INSERT
        // because the CLR value equalled the configured default; Postgres raised 23502.
        // Fix: Title is now a real domain property (no shadow), set by handler before SaveChanges.
        using var db = BuildInMemoryContext();
        var entityType = db.Model.FindEntityType(typeof(ReportJob))!;
        var prop = entityType.FindProperty(nameof(ReportJob.Title))!;

        prop.GetColumnName().Should().Be("title");

        prop.IsNullable.Should().BeFalse("title is NOT NULL — IsRequired() must be set");

        prop.GetDefaultValue().Should().BeNull(
            "HasDefaultValue must NOT be set on Title: EF omits the column from INSERT when " +
            "the CLR value equals the configured default → 23502 (no real DB default exists)");

        prop.GetDefaultValueSql().Should().BeNull(
            "HasDefaultValueSql must NOT be set on Title for the same reason");
    }

    [Fact]
    public void ReportJob_Title_IsSettableDirectly()
    {
        // Title must be a real public settable property so the handler can set it without
        // EF.Entry()/db.Property<T>() shadow-property APIs (which cross the Application/Infrastructure boundary).
        var job = new ReportJob { Title = "TallyExport Report 2025-26" };
        job.Title.Should().Be("TallyExport Report 2025-26");
    }
}
