using FluentAssertions;
using GstService.Application.Invoices.Commands.BulkImportInvoices;
using GstService.Application.Notices.Commands.CreateNotice;
using GstService.Application.Notices.Commands.RespondToNotice;
using FluentValidation.TestHelper;

namespace GstService.Tests;

/// <summary>
/// Unit tests for GST command validators (Phase 6B).
/// </summary>
[Trait("Category", "Unit")]
public sealed class GstValidatorTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    // ── BulkImportInvoices Validator ─────────────────────────────────────────

    [Fact]
    public void BulkImportInvoicesValidator_EmptyRows_Fails()
    {
        var validator = new BulkImportInvoicesCommandValidator();
        var cmd = new BulkImportInvoicesCommand(Guid.NewGuid(), null, []);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveValidationErrorFor(x => x.Invoices);
    }

    [Fact]
    public void BulkImportInvoicesValidator_Over500Rows_Fails()
    {
        var validator = new BulkImportInvoicesCommandValidator();
        var rows = Enumerable.Range(1, 501).Select(i => new BulkInvoiceItem(
            "B2B", $"INV-{i:D4}", Today, "22AAAAA0000A1Z5", "Test Supplier",
            1000m, 90m, 45m, 45m, 0m)).ToList();
        var cmd = new BulkImportInvoicesCommand(Guid.NewGuid(), null, rows);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveValidationErrorFor(x => x.Invoices);
    }

    [Fact]
    public void BulkImportInvoicesValidator_ValidRows_Passes()
    {
        var validator = new BulkImportInvoicesCommandValidator();
        var rows = new List<BulkInvoiceItem>
        {
            new("B2B", "INV-001", Today, "22AAAAA0000A1Z5", "Acme Corp", 10000m, 900m, 450m, 450m, 0m),
            new("B2C", "INV-002", Today, "22AAAAA0000A1Z5", "Retail", 5000m, 0m, 225m, 225m, 0m)
        };
        var cmd = new BulkImportInvoicesCommand(Guid.NewGuid(), null, rows);
        var result = validator.TestValidate(cmd);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void BulkImportInvoicesValidator_Exactly500Rows_Passes()
    {
        // Boundary test: exactly 500 rows should pass
        var validator = new BulkImportInvoicesCommandValidator();
        var rows = Enumerable.Range(1, 500).Select(i => new BulkInvoiceItem(
            "B2B", $"INV-{i:D4}", Today, "22AAAAA0000A1Z5", "Supplier", 1000m, 90m, 45m, 45m, 0m)).ToList();
        var cmd = new BulkImportInvoicesCommand(Guid.NewGuid(), null, rows);
        var result = validator.TestValidate(cmd);
        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── CreateNotice Validator ───────────────────────────────────────────────

    [Fact]
    public void CreateNoticeValidator_EmptyNoticeNumber_Fails()
    {
        var validator = new CreateNoticeCommandValidator();
        var cmd = new CreateNoticeCommand(Guid.NewGuid(), "", "ASMT-10", null, Today, null, null);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveValidationErrorFor(x => x.NoticeNumber);
    }

    [Fact]
    public void CreateNoticeValidator_ValidData_Passes()
    {
        var validator = new CreateNoticeCommandValidator();
        var cmd = new CreateNoticeCommand(
            Guid.NewGuid(), "ASMT-2025-001", "ASMT-10", "CGST Delhi", Today, Today.AddDays(30), "Test notice");
        var result = validator.TestValidate(cmd);
        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── RespondToNotice Validator ────────────────────────────────────────────

    [Fact]
    public void RespondToNoticeValidator_EmptyNoticeId_Fails()
    {
        var validator = new RespondToNoticeCommandValidator();
        var cmd = new RespondToNoticeCommand(Guid.Empty, Guid.NewGuid(), "Test response", null);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveValidationErrorFor(x => x.NoticeId);
    }

    [Fact]
    public void RespondToNoticeValidator_ResponseTooLong_Fails()
    {
        var validator = new RespondToNoticeCommandValidator();
        var longText = new string('x', 5001);
        var cmd = new RespondToNoticeCommand(Guid.NewGuid(), Guid.NewGuid(), longText, null);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveValidationErrorFor(x => x.ResponseText);
    }

    [Fact]
    public void RespondToNoticeValidator_ValidData_Passes()
    {
        var validator = new RespondToNoticeCommandValidator();
        var cmd = new RespondToNoticeCommand(Guid.NewGuid(), Guid.NewGuid(), "Our detailed response to the notice.", null);
        var result = validator.TestValidate(cmd);
        result.ShouldNotHaveAnyValidationErrors();
    }
}
