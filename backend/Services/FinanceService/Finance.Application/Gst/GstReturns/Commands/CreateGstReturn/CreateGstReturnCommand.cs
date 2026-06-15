using FluentValidation;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.CreateGstReturn;

/// <summary>Creates a new GST return draft for an organisation.</summary>
/// <param name="ReturnType">GSTR-1, GSTR-3B, or GSTR-9.</param>
/// <param name="FinancialYear">Format: YYYY-YY (e.g. "2024-25").</param>
/// <param name="Gstin">15-character GSTIN of the organisation.</param>
/// <param name="PeriodMonth">Month number (1-12) for monthly returns; null for annual (GSTR-9).</param>
public record CreateGstReturnCommand(
    Guid OrganizationId,
    string ReturnType,
    string FinancialYear,
    string Gstin,
    int? PeriodMonth = null,
    DateOnly? FilingDeadline = null) : ICommand<CreateGstReturnResponse>;

/// <summary>Response returned after the GST return draft is created.</summary>
public record CreateGstReturnResponse(Guid GstReturnId, string Status);

/// <summary>
/// FluentValidation validator for <see cref="CreateGstReturnCommand"/>.
/// Enforces GSTIN format (15 chars) and financial year format (YYYY-YY).
/// GST rates must be loaded from configuration — this validator only enforces structure.
/// </summary>
public sealed class CreateGstReturnCommandValidator : AbstractValidator<CreateGstReturnCommand>
{
    public CreateGstReturnCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();

        RuleFor(x => x.ReturnType)
            .Must(t => new[] { "GSTR-1", "GSTR-3B", "GSTR-9" }.Contains(t))
            .WithMessage("ReturnType must be GSTR-1, GSTR-3B, or GSTR-9.");

        RuleFor(x => x.FinancialYear)
            .NotEmpty()
            .Matches(@"^\d{4}-\d{2}$")
            .WithMessage("FinancialYear must be in format YYYY-YY (e.g. 2024-25).");

        RuleFor(x => x.Gstin)
            .NotEmpty()
            .Length(15).WithMessage("GSTIN must be exactly 15 characters.");

        // Monthly returns require PeriodMonth; annual (GSTR-9) does not
        When(x => x.ReturnType != "GSTR-9", () =>
            RuleFor(x => x.PeriodMonth)
                .NotNull().WithMessage("PeriodMonth is required for monthly returns.")
                .InclusiveBetween(1, 12));
    }
}

/// <summary>
/// Creates a GST return draft after checking for duplicates.
/// GST return status starts as DRAFT; it transitions through SUBMITTED → FILED.
/// </summary>
public sealed class CreateGstReturnCommandHandler(IGstReturnRepository repository)
    : ICommandHandler<CreateGstReturnCommand, CreateGstReturnResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateGstReturnResponse>> Handle(
        CreateGstReturnCommand request,
        CancellationToken cancellationToken)
    {
        // Idempotency check — prevent duplicate filings for the same period
        var exists = await repository.ExistsAsync(
            request.OrganizationId, request.ReturnType,
            request.FinancialYear, request.PeriodMonth, cancellationToken);

        if (exists)
            return Error.Conflict("GstReturn.AlreadyExists",
                $"{request.ReturnType} for {request.FinancialYear}" +
                (request.PeriodMonth.HasValue ? $" month {request.PeriodMonth}" : "") +
                " already exists.");

        var gstReturn = new GstReturn
        {
            OrganizationId = request.OrganizationId,
            ReturnType = request.ReturnType,
            FinancialYear = request.FinancialYear,
            Gstin = request.Gstin,
            PeriodMonth = request.PeriodMonth,
            FilingDeadline = request.FilingDeadline
        };

        var saved = await repository.AddAsync(gstReturn, cancellationToken);
        return new CreateGstReturnResponse(saved.Id, saved.Status);
    }
}
