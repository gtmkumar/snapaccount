using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Commands.RecordPayment;

/// <summary>
/// Records a successful payment and activates/renews the subscription.
/// Called from the Razorpay webhook handler (SEC-001 HMAC verified).
/// </summary>
public record RecordPaymentCommand(
    Guid SubscriptionId,
    string RazorpayPaymentId,
    string InvoiceNumber,
    decimal AmountInr,
    DateTime NewPeriodEnd) : ICommand<Result>;

/// <summary>Validates RecordPaymentCommand.</summary>
public sealed class RecordPaymentCommandValidator : AbstractValidator<RecordPaymentCommand>
{
    public RecordPaymentCommandValidator()
    {
        RuleFor(x => x.SubscriptionId).NotEmpty();
        RuleFor(x => x.RazorpayPaymentId).NotEmpty().MaximumLength(100);
        RuleFor(x => x.InvoiceNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.AmountInr).GreaterThan(0);
        RuleFor(x => x.NewPeriodEnd).GreaterThan(DateTime.UtcNow);
    }
}

/// <summary>Handler: records payment, renews subscription, marks invoice paid.</summary>
public sealed class RecordPaymentCommandHandler(
    ISubscriptionServiceDbContext db) : ICommandHandler<RecordPaymentCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        RecordPaymentCommand request,
        CancellationToken cancellationToken)
    {
        var sub = await db.Subscriptions
            .Include(s => s.Invoices)
            .Where(s => s.Id == request.SubscriptionId && s.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (sub == null)
            return Error.NotFound("Subscription", request.SubscriptionId);

        // Find the matching pending invoice or create one
        var invoice = sub.Invoices.FirstOrDefault(i => i.Status == "PENDING");

        if (invoice == null)
        {
            // Create a new invoice record for this payment (webhook-driven)
            invoice = Domain.Entities.Invoice.Create(
                sub.Id,
                sub.OrganizationId,
                request.InvoiceNumber,
                request.AmountInr,
                Math.Round(request.AmountInr * 0.18m, 2), // GST 18% on SaaS
                sub.CurrentPeriodStart,
                request.NewPeriodEnd);
            db.Invoices.Add(invoice);
        }

        invoice.MarkPaid(request.RazorpayPaymentId);
        sub.Renew(request.NewPeriodEnd);

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
