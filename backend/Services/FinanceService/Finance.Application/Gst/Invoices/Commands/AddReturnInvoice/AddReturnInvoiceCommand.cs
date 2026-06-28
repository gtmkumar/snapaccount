using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Commands.AddReturnInvoice;

/// <summary>
/// Adds a GST invoice to a specific return (POST /gst/returns/{id}/invoices).
/// P6-HANDOFF-13: uses canonical gst.invoices table.
/// Phase 6B: replaces the 501 stub.
/// DG-GST-01: after persisting the invoice, recalculates the return totals
/// (output CGST/SGST/IGST/cess, ITC) from all gst.invoices for that return.
/// </summary>
[RequiresPermission("gst.invoices.create")]
public record AddReturnInvoiceCommand(
    Guid GstReturnId,
    Guid OrganizationId,
    string InvoiceType,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    string SupplierGstin,
    string SupplierName,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    string? BuyerName = null,
    string? BuyerGstin = null) : ICommand<AddReturnInvoiceResponse>;

/// <summary>Response after adding an invoice to a return.</summary>
public record AddReturnInvoiceResponse(Guid InvoiceId, Guid GstReturnId, decimal TotalInvoiceValue);

/// <summary>Validator for add-return-invoice command.</summary>
public sealed class AddReturnInvoiceCommandValidator : AbstractValidator<AddReturnInvoiceCommand>
{
    public AddReturnInvoiceCommandValidator()
    {
        RuleFor(x => x.GstReturnId).NotEmpty();
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.InvoiceType)
            .Must(t => t is "B2B" or "B2C" or "CREDIT_NOTE" or "DEBIT_NOTE" or "EXPORT")
            .WithMessage("InvoiceType must be B2B, B2C, CREDIT_NOTE, DEBIT_NOTE, or EXPORT.");
        RuleFor(x => x.InvoiceNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.InvoiceDate).NotEmpty();
        RuleFor(x => x.SupplierGstin)
            .NotEmpty()
            .Matches(@"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
            .WithMessage("SupplierGstin must be a valid 15-character GSTIN.");
        RuleFor(x => x.SupplierName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.TaxableValue).GreaterThan(0);
        RuleFor(x => x.IgstAmount).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CgstAmount).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SgstAmount).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CessAmount).GreaterThanOrEqualTo(0);
    }
}

/// <summary>Handler for <see cref="AddReturnInvoiceCommand"/>.</summary>
public sealed class AddReturnInvoiceCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<AddReturnInvoiceCommand, AddReturnInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<AddReturnInvoiceResponse>> Handle(
        AddReturnInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        // Verify the return exists and belongs to the org
        var gstReturn = await dbContext.GstReturns
            .FirstOrDefaultAsync(r => r.Id == request.GstReturnId
                && r.OrganizationId == request.OrganizationId
                && r.DeletedAt == null,
                cancellationToken);

        if (gstReturn is null)
            return Error.NotFound("GstReturn.NotFound", $"Return {request.GstReturnId} not found.");

        if (gstReturn.Status is "FILED")
            return Error.Conflict("GstReturn.Filed", "Cannot add invoices to a filed return.");

        var invoice = GstInvoice.Create(
            request.OrganizationId,
            request.InvoiceType,
            request.InvoiceNumber,
            request.InvoiceDate,
            request.SupplierGstin,
            request.SupplierName,
            request.TaxableValue,
            request.IgstAmount,
            request.CgstAmount,
            request.SgstAmount,
            request.CessAmount);

        invoice.AssignToReturn(request.GstReturnId);
        if (request.BuyerGstin is not null || request.BuyerName is not null)
            invoice.SetBuyer(request.BuyerName, request.BuyerGstin);

        dbContext.GstInvoices.Add(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);

        // DG-GST-01: Recalculate return totals from all invoices for this return.
        // This ensures TotalTaxableValue/TotalIgst/TotalCgst/TotalSgst/TotalCess/NetTaxPayable
        // are always derived from the canonical gst.invoices rows, never left at zero.
        await RecalculateReturnTotalsAsync(gstReturn, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AddReturnInvoiceResponse(invoice.Id, request.GstReturnId, invoice.TotalInvoiceValue);
    }

    /// <summary>
    /// Aggregates all invoices and ITC records for the return and calls
    /// <see cref="GstReturn.UpdateTotals"/> so the return header reflects real figures.
    /// Output tax = sum of invoices assigned to this return.
    /// ITC available = sum of eligible itc_records linked to this return.
    /// NetTaxPayable = (outputIgst + outputCgst + outputSgst + outputCess) − itcAvailable.
    /// </summary>
    private async Task RecalculateReturnTotalsAsync(GstReturn gstReturn, CancellationToken ct)
    {
        // Sum output tax from all invoices assigned to this return.
        // Credit notes / debit notes have the same sign as entered (caller responsibility).
        var invoiceTotals = await dbContext.GstInvoices
            .Where(i => i.GstReturnId == gstReturn.Id && i.DeletedAt == null)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                TaxableValue = g.Sum(i => i.TaxableValue),
                Igst         = g.Sum(i => i.IgstAmount),
                Cgst         = g.Sum(i => i.CgstAmount),
                Sgst         = g.Sum(i => i.SgstAmount),
                Cess         = g.Sum(i => i.CessAmount),
            })
            .FirstOrDefaultAsync(ct);

        var totalTaxableValue = invoiceTotals?.TaxableValue ?? 0m;
        var totalIgst         = invoiceTotals?.Igst         ?? 0m;
        var totalCgst         = invoiceTotals?.Cgst         ?? 0m;
        var totalSgst         = invoiceTotals?.Sgst         ?? 0m;
        var totalCess         = invoiceTotals?.Cess         ?? 0m;

        // Sum eligible ITC for this return (GSTR-2B / 2A credits assigned to this return period).
        var itcAvailable = await dbContext.ItcRecords
            .Where(r => r.GstReturnId == gstReturn.Id && r.IsEligible && r.DeletedAt == null)
            .SumAsync(r => r.IgstCredit + r.CgstCredit + r.SgstCredit + r.CessCredit, ct);

        // Net tax payable = output tax − ITC; floor at zero (excess ITC is a refund scenario).
        var outputTax     = totalIgst + totalCgst + totalSgst + totalCess;
        var netTaxPayable = Math.Max(0m, outputTax - itcAvailable);

        gstReturn.UpdateTotals(totalTaxableValue, totalIgst, totalCgst, totalSgst, totalCess, itcAvailable, netTaxPayable);
    }
}
