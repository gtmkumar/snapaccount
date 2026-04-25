using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;

namespace GstService.Application.EWayBills.Commands.CreateEWayBill;

/// <summary>
/// E-Way Bill mandatory for goods movement &gt; INR 50,000.
/// Phase 6B: handler wired (was NotImplementedException stub).
/// </summary>
[RequiresPermission("gst.ewaybills.create")]
public record CreateEWayBillCommand(
    Guid OrganizationId,
    Guid? GstInvoiceId,
    string SupplyType,
    decimal TotalValue,
    string? FromPlace,
    string? ToPlace,
    string? VehicleNumber) : ICommand<CreateEWayBillResponse>;

/// <summary>Response after EWB creation.</summary>
public record CreateEWayBillResponse(string EwbNumber, DateTime ValidUpto);

/// <summary>Validator for create EWB command.</summary>
public sealed class CreateEWayBillCommandValidator : AbstractValidator<CreateEWayBillCommand>
{
    public CreateEWayBillCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.SupplyType)
            .Must(s => s is "OUTWARD" or "INWARD")
            .WithMessage("SupplyType must be OUTWARD or INWARD.");
        RuleFor(x => x.TotalValue).GreaterThan(0m);
        RuleFor(x => x.VehicleNumber)
            .MaximumLength(20).When(x => x.VehicleNumber is not null);
    }
}
