using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;

namespace GstService.Application.EInvoices.Commands.GenerateEInvoice;

/// <summary>
/// Generate IRN via NIC IRP (Invoice Registration Portal).
/// Mandatory for businesses with annual turnover &gt; 5 Crore.
/// IRP threshold check is performed in the handler — returns "not applicable" for smaller orgs.
/// Phase 6B: handler wired (was 501 stub).
/// </summary>
[RequiresPermission("gst.einvoices.generate")]
public record GenerateEInvoiceCommand(Guid GstInvoiceId) : ICommand<GenerateEInvoiceResponse>;

/// <summary>Response after IRN generation.</summary>
public record GenerateEInvoiceResponse(string IrnNumber, string? SignedQrCode);

/// <summary>Validator for generate e-invoice command.</summary>
public sealed class GenerateEInvoiceCommandValidator : AbstractValidator<GenerateEInvoiceCommand>
{
    public GenerateEInvoiceCommandValidator()
    {
        RuleFor(x => x.GstInvoiceId).NotEmpty();
    }
}
