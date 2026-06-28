using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Application.Subscriptions.Commands.GenerateInvoice;

/// <summary>Generates a pending invoice for the current billing period.</summary>
public record GenerateInvoiceCommand(Guid SubscriptionId) : ICommand<GenerateInvoiceResponse>;

/// <summary>
/// Response after generating an invoice.
/// DG-SUB-07: pdfGcsUri is now populated after PDF generation + GCS upload.
/// The frontend (subscriptionApi.ts line 194) expects this field; InvoiceManagementPage.tsx
/// line 211 gates the Download PDF button on <c>row.original.pdfGcsUri != null</c>.
/// </summary>
public record GenerateInvoiceResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    decimal AmountInr,
    decimal GstAmountInr,
    string Status,
    string? PdfGcsUri);

/// <summary>Validates GenerateInvoiceCommand.</summary>
public sealed class GenerateInvoiceCommandValidator : AbstractValidator<GenerateInvoiceCommand>
{
    public GenerateInvoiceCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
    }
}

/// <summary>
/// Handler: generates an invoice for the current period.
/// DG-SUB-07: after creating the DB row, generates a QuestPDF invoice PDF,
/// uploads it to GCS, and stores the URI on the invoice entity.
/// </summary>
public sealed class GenerateInvoiceCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser,
    ISubscriptionPdfGenerator pdfGenerator,
    ILogger<GenerateInvoiceCommandHandler> logger) : ICommandHandler<GenerateInvoiceCommand, GenerateInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<GenerateInvoiceResponse>> Handle(
        GenerateInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Subscription.NoOrg", "User is not associated with an organisation.");

        var sub = await db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.Id == request.SubscriptionId && s.OrganizationId == orgId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        // Generate sequential invoice number: INV-{orgId:short}-{yyyyMM}-{seq}
        var existingCount = await db.Invoices
            .CountAsync(i => i.OrganizationId == orgId, cancellationToken);

        var invoiceNumber = $"INV-{orgId.ToString()![..8].ToUpper()}-{DateTime.UtcNow:yyyyMM}-{existingCount + 1:D4}";

        var amountInr = sub.Plan.PriceInr;
        var gstAmount = Math.Round(amountInr * 0.18m, 2); // GST 18% on SaaS

        var invoice = Invoice.Create(
            sub.Id,
            orgId.Value,
            invoiceNumber,
            amountInr,
            gstAmount,
            sub.CurrentPeriodStart,
            sub.CurrentPeriodEnd);

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(cancellationToken);

        // DG-SUB-07: Generate PDF and upload to GCS.
        // Wrapped in try/catch — a PDF failure is non-fatal; the invoice is already persisted.
        string? pdfGcsUri = null;
        try
        {
            var dto = new InvoicePdfDto(
                InvoiceId:        invoice.Id,
                InvoiceNumber:    invoiceNumber,
                OrganizationId:   orgId.Value,
                OrganizationName: orgId.Value.ToString(), // resolved by PDF generator if org-name adapter available
                OrgGstin:         null,
                PlanName:         sub.Plan.Name,
                PlanTier:         sub.Plan.Tier.ToString(),
                AmountInr:        amountInr,
                GstAmountInr:     gstAmount,
                TotalInr:         amountInr + gstAmount,
                PeriodStart:      sub.CurrentPeriodStart,
                PeriodEnd:        sub.CurrentPeriodEnd,
                Status:           invoice.Status,
                PaidAt:           invoice.PaidAt,
                GeneratedAt:      DateTime.UtcNow);

            pdfGcsUri = await pdfGenerator.GenerateAndUploadAsync(dto, cancellationToken);
            invoice.SetPdfGcsUri(pdfGcsUri);
            await db.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Invoice PDF generated and stored: {InvoiceId} → {GcsUri}",
                invoice.Id, pdfGcsUri);
        }
        catch (Exception ex)
        {
            // Non-fatal: invoice is created; PDF can be regenerated later.
            logger.LogWarning(ex,
                "Invoice PDF generation failed for invoice {InvoiceId}. " +
                "Invoice is created but pdfGcsUri will be null.", invoice.Id);
        }

        return new GenerateInvoiceResponse(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.AmountInr,
            invoice.GstAmountInr,
            invoice.Status,
            pdfGcsUri);
    }
}
