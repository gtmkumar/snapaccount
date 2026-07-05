using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Commands.VoidInvoice;

/// <summary>
/// DG-SUB-11: Voids a PENDING or FAILED invoice.
/// Used when a subscription is cancelled before the invoice is paid,
/// or when an invoice was generated in error.
/// Admin route — only platform-admins can void invoices.
/// Permission: subscription.manage.
/// </summary>
[RequiresPermission("subscription.manage")]
public record VoidInvoiceCommand(Guid InvoiceId) : ICommand<Result>;

/// <summary>Validates <see cref="VoidInvoiceCommand"/>.</summary>
public sealed class VoidInvoiceCommandValidator : AbstractValidator<VoidInvoiceCommand>
{
    public VoidInvoiceCommandValidator()
    {
        RuleFor(x => x.InvoiceId).NotEmpty();
    }
}

/// <summary>Handles <see cref="VoidInvoiceCommand"/>.</summary>
public sealed class VoidInvoiceCommandHandler(
    ISubscriptionServiceDbContext db,
    ILogger<VoidInvoiceCommandHandler> logger)
    : ICommandHandler<VoidInvoiceCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        VoidInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices
            .Where(i => i.Id == request.InvoiceId && i.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (invoice == null)
            return Error.NotFound("Invoice", request.InvoiceId);

        if (invoice.Status is "PAID" or "REFUNDED")
            return Error.Validation("Invoice.CannotVoid",
                $"A {invoice.Status} invoice cannot be voided.");

        invoice.Void();
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Invoice {InvoiceId} ({InvoiceNumber}) voided.",
            invoice.Id, invoice.InvoiceNumber);

        return Result.Success();
    }
}
