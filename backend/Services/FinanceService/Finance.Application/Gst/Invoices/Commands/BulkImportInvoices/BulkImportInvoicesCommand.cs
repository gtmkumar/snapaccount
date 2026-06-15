using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Invoices.Commands.BulkImportInvoices;

/// <summary>
/// Bulk-imports GST invoices (POST /gst/invoices/bulk-import).
/// Accepts up to 500 invoices per call. Each invoice is validated individually.
/// P6-HANDOFF-13: writes to canonical gst.invoices table.
/// Phase 6B: replaces the 501 stub.
/// </summary>
[RequiresPermission("gst.invoices.create")]
public record BulkImportInvoicesCommand(
    Guid OrganizationId,
    Guid? GstReturnId,
    IReadOnlyList<BulkInvoiceItem> Invoices) : ICommand<BulkImportResponse>;

/// <summary>Single invoice item in bulk import.</summary>
public record BulkInvoiceItem(
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
    string? BuyerGstin = null);

/// <summary>Bulk import result.</summary>
public record BulkImportResponse(int ImportedCount, int SkippedCount, IReadOnlyList<string> Errors);

/// <summary>Validator for bulk import command.</summary>
public sealed class BulkImportInvoicesCommandValidator : AbstractValidator<BulkImportInvoicesCommand>
{
    public BulkImportInvoicesCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Invoices)
            .NotNull()
            .Must(l => l.Count >= 1).WithMessage("At least one invoice is required.")
            .Must(l => l.Count <= 500).WithMessage("Maximum 500 invoices per bulk import.");
    }
}

/// <summary>Handler for <see cref="BulkImportInvoicesCommand"/>.</summary>
public sealed class BulkImportInvoicesCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<BulkImportInvoicesCommand, BulkImportResponse>
{
    /// <inheritdoc />
    public async Task<Result<BulkImportResponse>> Handle(
        BulkImportInvoicesCommand request,
        CancellationToken cancellationToken)
    {
        var gstinRegex = new System.Text.RegularExpressions.Regex(
            @"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$");

        var imported = 0;
        var skipped = 0;
        var errors = new List<string>();

        foreach (var (item, idx) in request.Invoices.Select((x, i) => (x, i + 1)))
        {
            // Per-item validation
            if (!gstinRegex.IsMatch(item.SupplierGstin))
            {
                errors.Add($"Row {idx}: Invalid SupplierGstin '{item.SupplierGstin}'");
                skipped++;
                continue;
            }

            if (item.TaxableValue <= 0)
            {
                errors.Add($"Row {idx}: TaxableValue must be > 0");
                skipped++;
                continue;
            }

            var invoice = GstInvoice.Create(
                request.OrganizationId,
                item.InvoiceType,
                item.InvoiceNumber,
                item.InvoiceDate,
                item.SupplierGstin,
                item.SupplierName,
                item.TaxableValue,
                item.IgstAmount,
                item.CgstAmount,
                item.SgstAmount,
                item.CessAmount);

            if (request.GstReturnId.HasValue)
                invoice.AssignToReturn(request.GstReturnId.Value);

            if (item.BuyerGstin is not null || item.BuyerName is not null)
                invoice.SetBuyer(item.BuyerName, item.BuyerGstin);

            dbContext.GstInvoices.Add(invoice);
            imported++;
        }

        if (imported > 0)
            await dbContext.SaveChangesAsync(cancellationToken);

        return new BulkImportResponse(imported, skipped, errors);
    }
}
