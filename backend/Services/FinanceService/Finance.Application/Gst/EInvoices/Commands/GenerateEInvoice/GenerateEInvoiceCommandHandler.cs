using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.EInvoices.Commands.GenerateEInvoice;

/// <summary>
/// Generates an IRN via the IRP for a given GST invoice.
/// DG-GST-05: enforces the e-invoice turnover threshold gate before calling the IRP.
///   - Threshold is config-driven: <c>GstService:EInvoiceThresholdCrore</c> (default 5 Crore).
///   - Org annual turnover is stored in <c>gst.gst_org_profile</c> (migration 102).
///   - If no profile exists for the org, the call is blocked with EInvoice.NotApplicable.
///   - Admin can set <c>einvoice_enabled=true</c> in the org profile to force-enable.
/// Stores the IRN log entry in gst.e_invoice_irn_log (canonical table per P6-HANDOFF-13).
/// P6-HANDOFF-15: Request/response payloads are stored redacted — no auth tokens.
/// Phase 6B: replaces the NotImplementedException stub.
/// </summary>
public sealed class GenerateEInvoiceCommandHandler(
    IGstDbContext dbContext,
    IIrpClient irpClient,
    IGstServiceOptions options,
    ILogger<GenerateEInvoiceCommandHandler> logger)
    : ICommandHandler<GenerateEInvoiceCommand, GenerateEInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<GenerateEInvoiceResponse>> Handle(
        GenerateEInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        // Load the invoice
        var invoice = await dbContext.GstInvoices
            .Where(i => i.Id == request.GstInvoiceId && i.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (invoice is null)
            return Error.NotFound("GstInvoice.NotFound", $"Invoice {request.GstInvoiceId} not found.");

        if (invoice.IrnStatus == "GENERATED")
            return Error.Conflict("EInvoice.IrnAlreadyGenerated",
                $"IRN already generated for invoice {invoice.InvoiceNumber}: {invoice.IrnNumber}");

        // DG-GST-05: enforce e-invoice turnover threshold gate.
        // Load the org's GST profile to check annual turnover.
        var orgProfile = await dbContext.GstOrgProfiles
            .Where(p => p.OrganizationId == invoice.OrganizationId && p.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        var thresholdCrore = options.EInvoiceThresholdCrore;
        var isEInvoiceMandatory = orgProfile?.IsEInvoiceMandatory(thresholdCrore) ?? false;

        if (!isEInvoiceMandatory)
        {
            // Log and return a clear error — not a system failure, just not applicable.
            var turnoverNote = orgProfile is null
                ? "No GST org profile found for this organisation"
                : $"Annual turnover {orgProfile.AnnualTurnoverCr?.ToString("N2") ?? "not set"} Crore " +
                  $"does not exceed threshold of {thresholdCrore:N2} Crore";

            logger.LogInformation(
                "E-invoice not applicable for org {OrgId}, invoice {InvoiceId}. {TurnoverNote}.",
                invoice.OrganizationId, invoice.Id, turnoverNote);

            return new Error(
                "EInvoice.NotApplicable",
                $"E-invoicing is mandatory only for organisations with annual turnover > ₹{thresholdCrore:N2} Crore. " +
                $"{turnoverNote}. Update the org's GST profile to enable e-invoicing.",
                ErrorType.Validation);
        }

        // Call IRP adapter (mock or production depending on GST_PRODUCTION_APIS_ENABLED)
        var payload = new IrpInvoicePayload(
            SupplierGstin: invoice.SupplierGstin,
            InvoiceNumber: invoice.InvoiceNumber,
            InvoiceDate: invoice.InvoiceDate,
            InvoiceType: invoice.InvoiceType,
            TaxableValue: invoice.TaxableValue,
            IgstAmount: invoice.IgstAmount,
            CgstAmount: invoice.CgstAmount,
            SgstAmount: invoice.SgstAmount,
            CessAmount: invoice.CessAmount,
            TotalValue: invoice.TotalInvoiceValue,
            BuyerGstin: invoice.BuyerGstin);

        var irpResult = await irpClient.GenerateIrnAsync(payload, cancellationToken);

        if (!irpResult.IsSuccess || irpResult.IrnNumber is null)
            return new Error("EInvoice.IrnGenerationFailed",
                $"IRP returned failure: {irpResult.ErrorMessage}");

        // Update the canonical GstInvoice entity with IRN
        invoice.SetEInvoiceIrn(irpResult.IrnNumber, irpResult.SignedQrCode);

        // Create the EInvoice record (linked to the canonical invoice)
        var eInvoice = EInvoice.Create(
            invoice.OrganizationId,
            invoice.Id,
            irpResult.IrnNumber,
            irpResult.AckNumber,
            irpResult.AckDate,
            irpResult.SignedInvoiceData,
            irpResult.SignedQrCode);

        dbContext.EInvoices.Add(eInvoice);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new GenerateEInvoiceResponse(irpResult.IrnNumber, irpResult.SignedQrCode);
    }
}
