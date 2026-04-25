using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Application.Subscriptions.Commands.GenerateInvoice;

/// <summary>Generates a pending invoice for the current billing period.</summary>
public record GenerateInvoiceCommand(Guid SubscriptionId) : ICommand<GenerateInvoiceResponse>;

/// <summary>Response after generating an invoice.</summary>
public record GenerateInvoiceResponse(
    Guid InvoiceId,
    string InvoiceNumber,
    decimal AmountInr,
    decimal GstAmountInr,
    string Status);

/// <summary>Validates GenerateInvoiceCommand.</summary>
public sealed class GenerateInvoiceCommandValidator : AbstractValidator<GenerateInvoiceCommand>
{
    public GenerateInvoiceCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
    }
}

/// <summary>Handler: generates invoice for current period.</summary>
public sealed class GenerateInvoiceCommandHandler(
    ISubscriptionServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<GenerateInvoiceCommand, GenerateInvoiceResponse>
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

        return new GenerateInvoiceResponse(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.AmountInr,
            invoice.GstAmountInr,
            invoice.Status);
    }
}
