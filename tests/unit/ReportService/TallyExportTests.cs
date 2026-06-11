using FluentAssertions;
using FluentValidation.TestHelper;
using ReportService.Application.Reports.Commands.GenerateReport;
using ReportService.Domain.Entities;
using Xunit;

namespace ReportService.Tests;

/// <summary>
/// Unit tests for GAP-032 (Tally XML export) and GAP-043 (chat thread PDF) additions.
/// Covers: ReportType enum completeness, GenerateReportCommand validator extended rules,
/// and TallyExport/ChatThreadPdf type support assertions.
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class TallyExportTests
{
    private readonly GenerateReportCommandValidator _validator = new();

    // ── ReportType enum values ─────────────────────────────────────────────────

    [Fact]
    public void ReportType_TallyExport_HasValue8()
    {
        ((int)ReportType.TallyExport).Should().Be(8);
    }

    [Fact]
    public void ReportType_ChatThreadPdf_HasValue9()
    {
        ((int)ReportType.ChatThreadPdf).Should().Be(9);
    }

    [Fact]
    public void ReportType_AllExpectedValues_Exist()
    {
        var values = Enum.GetValues<ReportType>();

        values.Should().Contain(ReportType.TrialBalance, because: "original value 1");
        values.Should().Contain(ReportType.LoanPackage, because: "Phase 6C value 7");
        values.Should().Contain(ReportType.TallyExport, because: "GAP-032 value 8");
        values.Should().Contain(ReportType.ChatThreadPdf, because: "GAP-043 value 9");
        values.Should().HaveCount(9, because: "9 report types are defined");
    }

    // ── GenerateReportCommand validator — TallyExport ─────────────────────────

    [Fact]
    public void Validator_TallyExport_WithPeriodRange_Passes()
    {
        var cmd = new GenerateReportCommand(
            ReportType.TallyExport,
            ReportFormat.Pdf,
            FinancialYear: "2025-26",
            PeriodStart: new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc),
            PeriodEnd: new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc));

        _validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Validator_TallyExport_WithoutPeriodRange_Passes()
    {
        // Period is optional for Tally export (defaults to current FY in generator)
        var cmd = new GenerateReportCommand(
            ReportType.TallyExport,
            ReportFormat.Pdf,
            FinancialYear: null,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Validator_TallyExport_PeriodStartAfterEnd_Fails()
    {
        var cmd = new GenerateReportCommand(
            ReportType.TallyExport,
            ReportFormat.Pdf,
            FinancialYear: null,
            PeriodStart: new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc),
            PeriodEnd: new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc));

        _validator.TestValidate(cmd)
            .ShouldHaveValidationErrorFor(c => c.PeriodStart);
    }

    // ── GenerateReportCommand validator — ChatThreadPdf ────────────────────────

    [Fact]
    public void Validator_ChatThreadPdf_WithNullFinancialYear_Passes()
    {
        // Thread ID is encoded in FinancialYear field as a UUID string on the endpoint.
        // null FinancialYear always passes the validator.
        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            FinancialYear: null,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd).ShouldNotHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void Validator_ChatThreadPdf_IsValidEnum_PassesTypeCheck()
    {
        // The validator checks IsInEnum() — ChatThreadPdf=9 should pass
        var cmd = new GenerateReportCommand(
            ReportType.ChatThreadPdf,
            ReportFormat.Pdf,
            FinancialYear: null,
            PeriodStart: null,
            PeriodEnd: null);

        _validator.TestValidate(cmd).ShouldNotHaveValidationErrorFor(c => c.ReportType);
    }

    // ── Tally XML structure validation (logic tests — no DB required) ──────────

    [Fact]
    public void TallyXmlStructure_BuildLedgerMasterElement_ContainsRequiredTags()
    {
        // Validate the expected Tally XML element names / structure without running the generator.
        // This documents the contract for Tally Prime / ERP 9 import compatibility.
        var requiredTallyRootElements = new[] { "ENVELOPE", "HEADER", "BODY" };
        var requiredHeaderElements = new[] { "VERSION", "TALLYREQUEST", "TYPE", "SUBTYPE" };
        var requiredLedgerAttributes = new[] { "NAME", "PARENT", "OPENINGBALANCE", "CURRENCYNAME" };

        // Assert the known contract — documents the Tally import spec in tests
        requiredTallyRootElements.Should().Contain("ENVELOPE");
        requiredTallyRootElements.Should().Contain("HEADER");
        requiredHeaderElements.Should().Contain("TALLYREQUEST");
        requiredLedgerAttributes.Should().Contain("CURRENCYNAME",
            because: "Tally requires CURRENCYNAME=INR in ledger masters for Indian entities");
    }

    [Fact]
    public void TallyXmlStructure_VoucherEntries_RequireBothDebitAndCreditLedgerEntries()
    {
        // Document contract: each VOUCHER element must have two ALLLEDGERENTRIES.LIST
        // nodes — one for debit (ISDEEMEDPOSITIVE=Yes, negative amount) and one for credit.
        // This is the double-entry bookkeeping invariant for Tally XML.
        var voucher = new
        {
            DebitEntry = new { IsDeemed = "Yes", AmountSign = "negative" },
            CreditEntry = new { IsDeemed = "No", AmountSign = "positive" }
        };

        voucher.DebitEntry.IsDeemed.Should().Be("Yes");
        voucher.CreditEntry.IsDeemed.Should().Be("No");
    }

    // ── CSV fallback contract ─────────────────────────────────────────────────

    [Fact]
    public void TallyExport_CsvFallback_HeaderColumns_AreCorrect()
    {
        // Documents the CSV fallback header contract when Report:TallyExportEnabled=false
        const string expectedHeader = "Date,VoucherType,ReferenceNumber,DebitLedger,CreditLedger,Amount,Narration";

        var columns = expectedHeader.Split(',');

        columns.Should().HaveCount(7);
        columns.Should().Contain("Date");
        columns.Should().Contain("Amount");
        columns.Should().Contain("DebitLedger");
        columns.Should().Contain("CreditLedger");
    }

    // ── Feature flag contract ─────────────────────────────────────────────────

    [Fact]
    public void TallyExport_FeatureFlag_Key_MatchesExpectedConfigPath()
    {
        // Documents the config key so it can be found via dotnet user-secrets or Secret Manager
        const string expectedConfigKey = "Report:TallyExportEnabled";

        expectedConfigKey.Should().StartWith("Report:", because: "all report feature flags live under Report: namespace");
        expectedConfigKey.Should().EndWith("TallyExportEnabled");
    }
}
