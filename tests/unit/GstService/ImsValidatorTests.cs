using FluentAssertions;
using FluentValidation.TestHelper;
using GstService.Application.Gstr1a.Commands.CreateGstr1aAmendment;
using GstService.Application.Gstr1a.Queries.ListGstr1aAmendments;
using GstService.Application.Ims.Commands.ActOnImsInvoice;
using GstService.Application.Ims.Commands.BulkActOnImsInvoices;
using GstService.Application.Ims.Commands.FetchImsInvoices;
using GstService.Application.Ims.Queries.GetImsSummary;
using GstService.Application.Ims.Queries.ListImsInvoices;

namespace GstService.Tests;

/// <summary>
/// Unit tests for IMS command/query validators.
/// GAP-101: GSTN IMS mandatory from 1 Apr 2026.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ImsValidatorTests
{
    private static readonly Guid ValidOrgId = Guid.NewGuid();
    private static readonly Guid ValidUserId = Guid.NewGuid();
    private const string ValidGstin = "29AABCU9603R1ZX";
    private const string ValidPeriod = "032026";

    // ── FetchImsInvoicesCommand Validator ─────────────────────────────────────

    [Fact]
    public void FetchValidator_ValidCommand_Passes()
    {
        var validator = new FetchImsInvoicesCommandValidator();
        var cmd = new FetchImsInvoicesCommand(ValidOrgId, ValidGstin, ValidPeriod);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void FetchValidator_EmptyOrgId_Fails()
    {
        var validator = new FetchImsInvoicesCommandValidator();
        var cmd = new FetchImsInvoicesCommand(Guid.Empty, ValidGstin, ValidPeriod);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.OrganizationId);
    }

    [Fact]
    public void FetchValidator_InvalidGstin_Fails()
    {
        var validator = new FetchImsInvoicesCommandValidator();
        var cmd = new FetchImsInvoicesCommand(ValidOrgId, "INVALID", ValidPeriod);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Gstin);
    }

    [Fact]
    public void FetchValidator_InvalidPeriodFormat_Fails()
    {
        var validator = new FetchImsInvoicesCommandValidator();
        var cmd = new FetchImsInvoicesCommand(ValidOrgId, ValidGstin, "2026-03");
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Period);
    }

    [Fact]
    public void FetchValidator_PeriodTooShort_Fails()
    {
        var validator = new FetchImsInvoicesCommandValidator();
        var cmd = new FetchImsInvoicesCommand(ValidOrgId, ValidGstin, "0326");
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Period);
    }

    // ── ActOnImsInvoiceCommand Validator ──────────────────────────────────────

    [Fact]
    public void ActOnValidator_Accept_Passes()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var cmd = new ActOnImsInvoiceCommand(Guid.NewGuid(), ValidOrgId, "ACCEPTED", null, ValidUserId);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void ActOnValidator_Reject_WithReason_Passes()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var cmd = new ActOnImsInvoiceCommand(Guid.NewGuid(), ValidOrgId, "REJECTED", "Duplicate", ValidUserId);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void ActOnValidator_KeepPending_Passes()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var cmd = new ActOnImsInvoiceCommand(Guid.NewGuid(), ValidOrgId, "PENDING_KEPT", null, ValidUserId);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void ActOnValidator_InvalidAction_Fails()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var cmd = new ActOnImsInvoiceCommand(Guid.NewGuid(), ValidOrgId, "APPROVE", null, ValidUserId);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Action);
    }

    [Fact]
    public void ActOnValidator_EmptyInvoiceId_Fails()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var cmd = new ActOnImsInvoiceCommand(Guid.Empty, ValidOrgId, "ACCEPTED", null, ValidUserId);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.InvoiceId);
    }

    [Fact]
    public void ActOnValidator_ReasonTooLong_Fails()
    {
        var validator = new ActOnImsInvoiceCommandValidator();
        var longReason = new string('x', 501);
        var cmd = new ActOnImsInvoiceCommand(Guid.NewGuid(), ValidOrgId, "REJECTED", longReason, ValidUserId);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Reason);
    }

    // ── BulkActOnImsInvoicesCommand Validator ─────────────────────────────────

    [Fact]
    public void BulkActValidator_ValidSingleItem_Passes()
    {
        var validator = new BulkActOnImsInvoicesCommandValidator();
        var cmd = new BulkActOnImsInvoicesCommand(
            ValidOrgId, ValidUserId,
            [new BulkImsActionItem(Guid.NewGuid(), "ACCEPTED", null)]);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void BulkActValidator_EmptyItems_Fails()
    {
        var validator = new BulkActOnImsInvoicesCommandValidator();
        var cmd = new BulkActOnImsInvoicesCommand(ValidOrgId, ValidUserId, []);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Items);
    }

    [Fact]
    public void BulkActValidator_Over100Items_Fails()
    {
        var validator = new BulkActOnImsInvoicesCommandValidator();
        var items = Enumerable.Range(1, 101)
            .Select(_ => new BulkImsActionItem(Guid.NewGuid(), "ACCEPTED", null))
            .ToList();
        var cmd = new BulkActOnImsInvoicesCommand(ValidOrgId, ValidUserId, items);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.Items);
    }

    [Fact]
    public void BulkActValidator_Exactly100Items_Passes()
    {
        var validator = new BulkActOnImsInvoicesCommandValidator();
        var items = Enumerable.Range(1, 100)
            .Select(_ => new BulkImsActionItem(Guid.NewGuid(), "REJECTED", "Price mismatch"))
            .ToList();
        var cmd = new BulkActOnImsInvoicesCommand(ValidOrgId, ValidUserId, items);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void BulkActValidator_ItemWithInvalidAction_Fails()
    {
        var validator = new BulkActOnImsInvoicesCommandValidator();
        var cmd = new BulkActOnImsInvoicesCommand(
            ValidOrgId, ValidUserId,
            [new BulkImsActionItem(Guid.NewGuid(), "INVALID_ACTION", null)]);
        var result = validator.TestValidate(cmd);
        result.ShouldHaveAnyValidationError();
    }

    // ── ListImsInvoicesQuery Validator ────────────────────────────────────────

    [Fact]
    public void ListValidator_ValidQuery_Passes()
    {
        var validator = new ListImsInvoicesQueryValidator();
        var query = new ListImsInvoicesQuery(ValidOrgId, ValidPeriod, "PENDING", null, null, 1, 20);
        validator.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void ListValidator_InvalidStatus_Fails()
    {
        var validator = new ListImsInvoicesQueryValidator();
        var query = new ListImsInvoicesQuery(ValidOrgId, ValidPeriod, "UNKNOWN", null, null, 1, 20);
        validator.TestValidate(query).ShouldHaveValidationErrorFor(x => x.Status);
    }

    [Fact]
    public void ListValidator_PageSizeOver200_Fails()
    {
        var validator = new ListImsInvoicesQueryValidator();
        var query = new ListImsInvoicesQuery(ValidOrgId, null, null, null, null, 1, 201);
        validator.TestValidate(query).ShouldHaveValidationErrorFor(x => x.PageSize);
    }

    [Fact]
    public void ListValidator_SearchOver100Chars_Fails()
    {
        var validator = new ListImsInvoicesQueryValidator();
        var longSearch = new string('x', 101);
        var query = new ListImsInvoicesQuery(ValidOrgId, null, null, null, longSearch, 1, 20);
        validator.TestValidate(query).ShouldHaveValidationErrorFor(x => x.Search);
    }

    // ── GetImsSummaryQuery Validator ──────────────────────────────────────────

    [Fact]
    public void SummaryValidator_ValidQuery_Passes()
    {
        var validator = new GetImsSummaryQueryValidator();
        var query = new GetImsSummaryQuery(ValidOrgId, ValidPeriod);
        validator.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void SummaryValidator_InvalidPeriod_Fails()
    {
        var validator = new GetImsSummaryQueryValidator();
        var query = new GetImsSummaryQuery(ValidOrgId, "Mar2026");
        validator.TestValidate(query).ShouldHaveValidationErrorFor(x => x.Period);
    }

    // ── CreateGstr1aAmendmentCommand Validator ────────────────────────────────

    [Fact]
    public void Gstr1aValidator_ValidCommand_Passes()
    {
        var validator = new CreateGstr1aAmendmentCommandValidator();
        var cmd = new CreateGstr1aAmendmentCommand(
            OrganizationId: ValidOrgId,
            OriginalImsInvoiceId: null,
            OriginalInvoiceNumber: "INV-001",
            OriginalSupplierGstin: ValidGstin,
            AmendmentType: "B2B_AMENDMENT",
            AmendmentPayloadJson: """{"amended_invoice_no":"INV-001A","amended_value":12000}""",
            Period: ValidPeriod);
        validator.TestValidate(cmd).ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Gstr1aValidator_InvalidAmendmentType_Fails()
    {
        var validator = new CreateGstr1aAmendmentCommandValidator();
        var cmd = new CreateGstr1aAmendmentCommand(
            ValidOrgId, null, "INV-001", ValidGstin, "WRONG_TYPE",
            """{}""", ValidPeriod);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.AmendmentType);
    }

    [Fact]
    public void Gstr1aValidator_EmptyPayload_Fails()
    {
        var validator = new CreateGstr1aAmendmentCommandValidator();
        var cmd = new CreateGstr1aAmendmentCommand(
            ValidOrgId, null, "INV-001", ValidGstin, "B2BA", "", ValidPeriod);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.AmendmentPayloadJson);
    }

    [Fact]
    public void Gstr1aValidator_InvalidSupplierGstin_Fails()
    {
        var validator = new CreateGstr1aAmendmentCommandValidator();
        var cmd = new CreateGstr1aAmendmentCommand(
            ValidOrgId, null, "INV-001", "BADGSTIN", "B2B_AMENDMENT", """{}""", ValidPeriod);
        validator.TestValidate(cmd).ShouldHaveValidationErrorFor(x => x.OriginalSupplierGstin);
    }

    [Fact]
    public void ListGstr1aValidator_InvalidStatus_Fails()
    {
        var validator = new ListGstr1aAmendmentsQueryValidator();
        var query = new ListGstr1aAmendmentsQuery(ValidOrgId, null, "UNKNOWN", 1, 20);
        validator.TestValidate(query).ShouldHaveValidationErrorFor(x => x.Status);
    }
}
