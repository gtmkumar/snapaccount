using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.StartFiling;

/// <summary>
/// Creates a new ITR filing in DRAFT status for the given assessee and assessment year.
/// Phase 6D.
/// </summary>
[RequiresPermission("itr.filings.create")]
public record StartFilingCommand(
    Guid AssesseeId,
    string AssessmentYear,
    string ItrFormType,
    string Regime) : ICommand<StartFilingResponse>;

public record StartFilingResponse(Guid FilingId, string AssessmentYear, string Status);

public sealed class StartFilingCommandValidator : AbstractValidator<StartFilingCommand>
{
    private static readonly string[] ValidRegimes = ["OLD", "NEW"];
    private static readonly string[] ValidForms = ["ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6", "ITR-7"];

    public StartFilingCommandValidator()
    {
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.AssessmentYear)
            .NotEmpty()
            .Matches(@"^AY\d{4}-\d{2}$")
            .WithMessage("AssessmentYear must be in format AY2025-26.");
        RuleFor(x => x.ItrFormType)
            .Must(f => ValidForms.Contains(f))
            .WithMessage($"ItrFormType must be one of: {string.Join(", ", ValidForms)}.");
        RuleFor(x => x.Regime)
            .Must(r => ValidRegimes.Contains(r))
            .WithMessage("Regime must be OLD or NEW.");
    }
}

public sealed class StartFilingCommandHandler(IItrDbContext dbContext)
    : ICommandHandler<StartFilingCommand, StartFilingResponse>
{
    public async Task<Result<StartFilingResponse>> Handle(StartFilingCommand request, CancellationToken cancellationToken)
    {
        // Idempotency: only one active filing per AY
        var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.Filings.Where(f => f.AssesseeId == request.AssesseeId
                    && f.AssessmentYear == request.AssessmentYear
                    && f.DeletedAt == null),
                cancellationToken);

        if (existing is not null)
            return Error.Conflict("Filing.AlreadyExists",
                $"A filing for {request.AssessmentYear} already exists (status: {existing.Status}).");

        var filing = Filing.Create(request.AssesseeId, request.AssessmentYear, request.ItrFormType, request.Regime);
        dbContext.Filings.Add(filing);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new StartFilingResponse(filing.Id, filing.AssessmentYear, filing.Status);
    }
}
