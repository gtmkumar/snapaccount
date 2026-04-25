using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Commands.AddReturnInvoice;

/// <summary>
/// Adds a GST invoice to a specific return (POST /gst/returns/{id}/invoices).
/// P6-HANDOFF-13: uses canonical gst.invoices table.
/// Phase 6B: replaces the 501 stub.
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
        var gstReturn = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstReturns.Where(r => r.Id == request.GstReturnId
                    && r.OrganizationId == request.OrganizationId
                    && r.DeletedAt == null),
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

        return new AddReturnInvoiceResponse(invoice.Id, request.GstReturnId, invoice.TotalInvoiceValue);
    }
}
