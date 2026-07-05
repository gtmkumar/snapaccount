using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.TaxRates.Commands.DeactivateTaxRate;

/// <summary>
/// GAP-022: Soft-deactivates a GST tax rate so it is excluded from future lookups.
/// Does not delete the row — the audit trail is preserved.
/// </summary>
[RequiresPermission("gst.admin.taxrates")]
public record DeactivateTaxRateCommand(Guid TaxRateId) : ICommand;

/// <summary>Validates the DeactivateTaxRateCommand.</summary>
public sealed class DeactivateTaxRateCommandValidator : AbstractValidator<DeactivateTaxRateCommand>
{
    /// <summary>Initialises validation rules.</summary>
    public DeactivateTaxRateCommandValidator() => RuleFor(x => x.TaxRateId).NotEmpty();
}

/// <summary>Handles <see cref="DeactivateTaxRateCommand"/>.</summary>
public sealed class DeactivateTaxRateCommandHandler(IGstDbContext db)
    : ICommandHandler<DeactivateTaxRateCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        DeactivateTaxRateCommand request,
        CancellationToken cancellationToken)
    {
        var rate = await db.GstTaxRates
            .FirstOrDefaultAsync(
                r => r.Id == request.TaxRateId && r.DeletedAt == null,
                cancellationToken);

        if (rate is null)
            return Result.Failure(
                Error.NotFound("TaxRate.NotFound", $"Tax rate {request.TaxRateId} not found."));

        if (!rate.IsActive)
            return Result.Success(); // idempotent

        rate.Deactivate();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
