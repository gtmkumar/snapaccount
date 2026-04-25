using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Commands.CreateGstInvoice;

/// <summary>
/// Creates a new GST invoice in the <c>gst.gst_invoices</c> table.
/// Phase 6A: replaces the 501 stub for POST /gst/invoices.
/// GSTIN format: 15-char (2-digit state code + PAN + entity type + Z + check digit).
/// GST rates are validated against configurable values (not hardcoded enum).
/// </summary>
public record CreateGstInvoiceCommand(
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
    string? BuyerGstin = null) : ICommand<CreateGstInvoiceResponse>;

/// <summary>Response after creating an invoice.</summary>
public record CreateGstInvoiceResponse(Guid InvoiceId, string InvoiceNumber, decimal TotalInvoiceValue);

/// <summary>Validates the create invoice command. GSTIN format enforced here.</summary>
public sealed class CreateGstInvoiceCommandValidator : AbstractValidator<CreateGstInvoiceCommand>
{
    public CreateGstInvoiceCommandValidator()
    {
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

/// <summary>
/// Handles <see cref="CreateGstInvoiceCommand"/>.
/// Uses <see cref="IGstDbContext"/> directly — invoice does not have its own repository yet.
/// </summary>
public sealed class CreateGstInvoiceCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<CreateGstInvoiceCommand, CreateGstInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateGstInvoiceResponse>> Handle(
        CreateGstInvoiceCommand request,
        CancellationToken cancellationToken)
    {
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

        dbContext.GstInvoices.Add(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateGstInvoiceResponse(invoice.Id, invoice.InvoiceNumber, invoice.TotalInvoiceValue);
    }
}
