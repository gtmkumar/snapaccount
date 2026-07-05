using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Application.Subscriptions.Commands.RefundInvoice;

/// <summary>
/// DG-SUB-11: Marks a PAID invoice as refunded.
/// Admin route — only platform-admins can issue refunds.
/// The actual payment reversal on Razorpay is a separate Razorpay operation;
/// this command only tracks the refund state in our database.
/// Permission: subscription.manage.
/// </summary>
[RequiresPermission("subscription.manage")]
public record RefundInvoiceCommand(Guid InvoiceId, string? RefundReason = null) : ICommand<Result>;

/// <summary>Validates <see cref="RefundInvoiceCommand"/>.</summary>
public sealed class RefundInvoiceCommandValidator : AbstractValidator<RefundInvoiceCommand>
{
    public RefundInvoiceCommandValidator()
    {
        RuleFor(x => x.InvoiceId).NotEmpty();
        RuleFor(x => x.RefundReason).MaximumLength(500).When(x => x.RefundReason is not null);
    }
}

/// <summary>Handles <see cref="RefundInvoiceCommand"/>.</summary>
public sealed class RefundInvoiceCommandHandler(
    ISubscriptionServiceDbContext db,
    ILogger<RefundInvoiceCommandHandler> logger)
    : ICommandHandler<RefundInvoiceCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        RefundInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices
            .Where(i => i.Id == request.InvoiceId && i.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (invoice == null)
            return Error.NotFound("Invoice", request.InvoiceId);

        if (invoice.Status != "PAID")
            return Error.Validation("Invoice.CannotRefund",
                $"Only PAID invoices can be refunded. Current status: {invoice.Status}.");

        invoice.MarkRefunded(request.RefundReason);
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Invoice {InvoiceId} ({InvoiceNumber}) refunded. Reason: {Reason}",
            invoice.Id, invoice.InvoiceNumber, request.RefundReason ?? "(none)");

        return Result.Success();
    }
}
