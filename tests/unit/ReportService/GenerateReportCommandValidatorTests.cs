using FluentAssertions;
using FluentValidation.TestHelper;
using ReportService.Application.Reports.Commands.GenerateReport;
using ReportService.Domain.Entities;
using Xunit;

namespace ReportService.Tests;

/// <summary>
/// Validator coverage for <see cref="GenerateReportCommand"/>. The validator
/// is the only piece of GenerateReport that's pure (handler has DB and
/// generator deps); covering it here gives us regression safety on the
/// FY-format and LoanPackage rules without infrastructure.
/// </summary>
[Trait("Category", "Unit")]
public class GenerateReportCommandValidatorTests
{
    private readonly GenerateReportCommandValidator _v = new();

    private static GenerateReportCommand Valid(
        ReportType type = ReportType.TrialBalance,
        ReportFormat format = ReportFormat.Pdf,
        string? fy = "2025-26",
        Guid? loanApp = null) =>
        new(type, format, fy, null, null, loanApp);

    [Fact]
    public void Defaults_AreValid()
    {
        _v.TestValidate(Valid()).ShouldNotHaveAnyValidationErrors();
    }

    // ── Financial year format ────────────────────────────────────────

    [Theory]
    [InlineData("2024-25")]
    [InlineData("2025-26")]
    [InlineData("2099-00")]
    public void FinancialYear_ValidFormats_Pass(string fy)
    {
        _v.TestValidate(Valid(fy: fy))
            .ShouldNotHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Theory]
    [InlineData("2025")]
    [InlineData("FY2025-26")]
    [InlineData("2025-2026")]
    [InlineData("25-26")]
    public void FinancialYear_InvalidFormats_Fail(string fy)
    {
        _v.TestValidate(Valid(fy: fy))
            .ShouldHaveValidationErrorFor(c => c.FinancialYear);
    }

    [Fact]
    public void FinancialYear_Null_IsAllowed()
    {
        _v.TestValidate(Valid(fy: null))
            .ShouldNotHaveValidationErrorFor(c => c.FinancialYear);
    }

    // ── Period range invariant ───────────────────────────────────────

    [Fact]
    public void PeriodStart_BeforePeriodEnd_Passes()
    {
        var cmd = new GenerateReportCommand(
            ReportType.ProfitAndLoss, ReportFormat.Pdf, "2025-26",
            new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc),
            new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc));
        _v.TestValidate(cmd).ShouldNotHaveValidationErrorFor(c => c.PeriodStart);
    }

    [Fact]
    public void PeriodStart_EqualToPeriodEnd_Fails()
    {
        var ts = new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc);
        var cmd = new GenerateReportCommand(
            ReportType.ProfitAndLoss, ReportFormat.Pdf, "2025-26", ts, ts);
        _v.TestValidate(cmd).ShouldHaveValidationErrorFor(c => c.PeriodStart);
    }

    [Fact]
    public void PeriodStart_AfterPeriodEnd_Fails()
    {
        var cmd = new GenerateReportCommand(
            ReportType.ProfitAndLoss, ReportFormat.Pdf, "2025-26",
            new DateTime(2026, 3, 31, 0, 0, 0, DateTimeKind.Utc),
            new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc));
        _v.TestValidate(cmd).ShouldHaveValidationErrorFor(c => c.PeriodStart);
    }

    [Fact]
    public void PeriodStart_Without_PeriodEnd_IsAllowed()
    {
        var cmd = new GenerateReportCommand(
            ReportType.ProfitAndLoss, ReportFormat.Pdf, "2025-26",
            new DateTime(2025, 4, 1, 0, 0, 0, DateTimeKind.Utc), null);
        _v.TestValidate(cmd).ShouldNotHaveValidationErrorFor(c => c.PeriodStart);
    }

    // ── LoanPackage requires LoanApplicationId ───────────────────────

    [Fact]
    public void LoanPackage_WithoutLoanApplicationId_Fails()
    {
        _v.TestValidate(Valid(type: ReportType.LoanPackage, loanApp: null))
            .ShouldHaveValidationErrorFor(c => c.LoanApplicationId)
            .WithErrorMessage("LoanApplicationId is required for LoanPackage reports.");
    }

    [Fact]
    public void LoanPackage_WithLoanApplicationId_Passes()
    {
        _v.TestValidate(Valid(type: ReportType.LoanPackage, loanApp: Guid.NewGuid()))
            .ShouldNotHaveValidationErrorFor(c => c.LoanApplicationId);
    }

    [Fact]
    public void NonLoanPackage_NoLoanApplicationId_Passes()
    {
        // Sanity: TrialBalance (and friends) shouldn't require loan app id.
        _v.TestValidate(Valid(type: ReportType.TrialBalance, loanApp: null))
            .ShouldNotHaveValidationErrorFor(c => c.LoanApplicationId);
    }
}
