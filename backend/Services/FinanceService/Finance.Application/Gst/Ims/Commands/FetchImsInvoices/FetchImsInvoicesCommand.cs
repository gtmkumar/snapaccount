using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Commands.FetchImsInvoices;

/// <summary>
/// Syncs inward invoices from GSTN IMS (or mock) into the local <c>gst.ims_invoices</c> store.
/// Uses upsert semantics: new invoices are inserted; existing ones (matched by org + supplier GSTIN
/// + invoice number + period) are left unchanged to preserve local action status.
///
/// This command is safe to call repeatedly (idempotent for existing records).
/// It can be invoked via the API (<c>POST /gst/ims/sync</c>) or scheduled by Hangfire.
/// </summary>
[RequiresPermission("gst.ims.sync")]
public record FetchImsInvoicesCommand(
    Guid OrganizationId,
    string Gstin,
    string Period) : ICommand<FetchImsInvoicesResponse>;

/// <summary>Response from a sync operation.</summary>
public record FetchImsInvoicesResponse(
    int Inserted,
    int Skipped,
    string Period);

/// <summary>Validator for <see cref="FetchImsInvoicesCommand"/>.</summary>
public sealed class FetchImsInvoicesCommandValidator : AbstractValidator<FetchImsInvoicesCommand>
{
    public FetchImsInvoicesCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Gstin)
            .NotEmpty()
            .Length(15)
            .Matches(@"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
            .WithMessage("GSTIN must be a valid 15-character GST identification number.");
        RuleFor(x => x.Period)
            .NotEmpty()
            .Matches(@"^\d{2}\d{4}$")
            .WithMessage("Period must be in MMYYYY format (e.g. '032026').");
    }
}

/// <summary>Handler for <see cref="FetchImsInvoicesCommand"/>.</summary>
public sealed class FetchImsInvoicesCommandHandler(
    IGstDbContext dbContext,
    IImsGstnClient imsClient) : ICommandHandler<FetchImsInvoicesCommand, FetchImsInvoicesResponse>
{
    /// <inheritdoc />
    public async Task<Result<FetchImsInvoicesResponse>> Handle(
        FetchImsInvoicesCommand request,
        CancellationToken cancellationToken)
    {
        var apiResult = await imsClient.GetImsInvoicesAsync(request.Gstin, request.Period, cancellationToken);
        if (!apiResult.IsSuccess)
            return Result<FetchImsInvoicesResponse>.Failure(
                new Error("ImsInvoice.SyncFailed", $"GSTN IMS API returned an error: {apiResult.ErrorMessage}"));

        var incoming = apiResult.Data ?? [];
        if (incoming.Count == 0)
            return new FetchImsInvoicesResponse(0, 0, request.Period);

        // Load existing invoice keys for this org + period to detect duplicates
        var existingKeys = (await dbContext.ImsInvoices
            .Where(i => i.OrganizationId == request.OrganizationId
                     && i.Period == request.Period
                     && i.DeletedAt == null)
            .Select(i => new { i.SupplierGstin, i.InvoiceNumber })
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var inserted = 0;
        var skipped = 0;

        foreach (var record in incoming)
        {
            var key = new { record.SupplierGstin, record.InvoiceNumber };
            if (existingKeys.Contains(key))
            {
                skipped++;
                continue;
            }

            var invoice = ImsInvoice.Create(
                organizationId: request.OrganizationId,
                supplierGstin: record.SupplierGstin,
                supplierName: record.SupplierName,
                invoiceNumber: record.InvoiceNumber,
                invoiceDate: record.InvoiceDate,
                invoiceValue: record.InvoiceValue,
                taxableValue: record.TaxableValue,
                igstAmount: record.IgstAmount,
                cgstAmount: record.CgstAmount,
                sgstAmount: record.SgstAmount,
                cessAmount: record.CessAmount,
                period: request.Period,
                source: record.Source);

            dbContext.ImsInvoices.Add(invoice);
            inserted++;
        }

        if (inserted > 0)
            await dbContext.SaveChangesAsync(cancellationToken);

        return new FetchImsInvoicesResponse(inserted, skipped, request.Period);
    }
}
