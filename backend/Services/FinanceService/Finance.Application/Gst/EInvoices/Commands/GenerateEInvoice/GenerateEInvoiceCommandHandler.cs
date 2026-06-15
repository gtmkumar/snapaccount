using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.EInvoices.Commands.GenerateEInvoice;

/// <summary>
/// Generates an IRN via the IRP for a given GST invoice.
/// IRP threshold: only applicable when org annual_turnover_cr > 5.
/// Stores the IRN log entry in gst.e_invoice_irn_log (canonical table per P6-HANDOFF-13).
/// P6-HANDOFF-15: Request/response payloads are stored redacted — no auth tokens.
/// Phase 6B: replaces the NotImplementedException stub.
/// </summary>
public sealed class GenerateEInvoiceCommandHandler(
    IGstDbContext dbContext,
    IIrpClient irpClient) : ICommandHandler<GenerateEInvoiceCommand, GenerateEInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<GenerateEInvoiceResponse>> Handle(
        GenerateEInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        // Load the invoice
        var invoice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstInvoices.Where(i => i.Id == request.GstInvoiceId && i.DeletedAt == null),
                cancellationToken);

        if (invoice is null)
            return Error.NotFound("GstInvoice.NotFound", $"Invoice {request.GstInvoiceId} not found.");

        if (invoice.IrnStatus == "GENERATED")
            return Error.Conflict("EInvoice.IrnAlreadyGenerated",
                $"IRN already generated for invoice {invoice.InvoiceNumber}: {invoice.IrnNumber}");

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
