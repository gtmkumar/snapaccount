using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.FiscalYear.Commands.CloseFiscalYear;

/// <summary>
/// Closes an open financial year for an organisation.
/// Maps to <c>accounting.financial_year_close</c> (existing from migration 003). P6-HANDOFF-01.
/// SEC-026: requires accounting.fiscal_year.close permission.
/// </summary>
[RequiresPermission("accounting.fiscal_year.close")]
public record CloseFiscalYearCommand(
    Guid OrgId,
    int FyYear,
    Guid ClosedByUserId,
    string? Notes = null) : ICommand<CloseFiscalYearResponse>;

/// <summary>Response after closing a financial year.</summary>
public record CloseFiscalYearResponse(Guid FiscalYearCloseId, int FyYear, string Status);

/// <summary>Validates the close fiscal year command.</summary>
public sealed class CloseFiscalYearCommandValidator : AbstractValidator<CloseFiscalYearCommand>
{
    public CloseFiscalYearCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
        RuleFor(x => x.ClosedByUserId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(2000).When(x => x.Notes is not null);
    }
}

/// <summary>Handles <see cref="CloseFiscalYearCommand"/>.</summary>
public sealed class CloseFiscalYearCommandHandler(IFiscalYearCloseRepository repository)
    : ICommandHandler<CloseFiscalYearCommand, CloseFiscalYearResponse>
{
    /// <inheritdoc />
    public async Task<Result<CloseFiscalYearResponse>> Handle(
        CloseFiscalYearCommand request,
        CancellationToken cancellationToken)
    {
        var existing = await repository.GetByOrgAndYearAsync(request.OrgId, request.FyYear, cancellationToken);

        FiscalYearClose fyClose;
        if (existing is null)
        {
            fyClose = FiscalYearClose.Open(request.OrgId, request.FyYear);
        }
        else
        {
            fyClose = existing;
        }

        var result = fyClose.Close(request.ClosedByUserId, request.Notes);
        if (result.IsFailure) return result.Error;

        if (existing is null)
            await repository.AddAsync(fyClose, cancellationToken);
        else
            await repository.UpdateAsync(fyClose, cancellationToken);

        return new CloseFiscalYearResponse(fyClose.Id, fyClose.FyYear, fyClose.Status);
    }
}
