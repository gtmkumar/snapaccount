using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Filings.Queries.GetFiling;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.UpdateFilingDraft;

/// <summary>
/// Autosaves income-head inputs and CA notes on a filing WITHOUT changing its status.
/// DG-ITR-02: called by PATCH /itr/filings/{id} from admin CA tax-computation panel
/// (30-second autosave + explicit Save Draft button).
/// DG-ITR-04: caNotes is persisted to the dedicated ca_notes column, distinct from
/// CaRejectionReason which maps to ca_review_notes.
/// </summary>
[RequiresPermission("itr.filings.update")]
public record UpdateFilingDraftCommand(
    Guid FilingId,
    decimal? SalaryIncome,
    decimal? HousePropertyIncome,
    decimal? BusinessIncome,
    decimal? CapitalGains,
    decimal? OtherIncome,
    string? CaNotes) : ICommand<FilingDetailDto>;

public sealed class UpdateFilingDraftCommandValidator : AbstractValidator<UpdateFilingDraftCommand>
{
    public UpdateFilingDraftCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        When(x => x.SalaryIncome.HasValue, () =>
            RuleFor(x => x.SalaryIncome!.Value).GreaterThanOrEqualTo(0));
        When(x => x.HousePropertyIncome.HasValue, () =>
            RuleFor(x => x.HousePropertyIncome!.Value).GreaterThanOrEqualTo(-10_00_00_000m)
                .WithMessage("HousePropertyIncome loss cannot exceed ₹1 crore."));
        When(x => x.BusinessIncome.HasValue, () =>
            RuleFor(x => x.BusinessIncome!.Value).GreaterThanOrEqualTo(-10_00_00_000m));
        When(x => x.CapitalGains.HasValue, () =>
            RuleFor(x => x.CapitalGains!.Value).GreaterThanOrEqualTo(-10_00_00_000m));
        When(x => x.OtherIncome.HasValue, () =>
            RuleFor(x => x.OtherIncome!.Value).GreaterThanOrEqualTo(0));
        When(x => x.CaNotes is not null, () =>
            RuleFor(x => x.CaNotes!).MaximumLength(5000));
    }
}

public sealed class UpdateFilingDraftCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<UpdateFilingDraftCommand, FilingDetailDto>
{
    public async Task<Result<FilingDetailDto>> Handle(UpdateFilingDraftCommand request, CancellationToken cancellationToken)
    {
        var filing = await dbContext.Filings
            .FirstOrDefaultAsync(f => f.Id == request.FilingId && f.DeletedAt == null, cancellationToken);

        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: org-scoped IDOR check — assessee must belong to caller's org.
        var assessee = await dbContext.Assessees
            .FirstOrDefaultAsync(
                a => a.Id == filing.AssesseeId
                     && a.DeletedAt == null
                     && a.OrganizationId == currentUser.OrganizationId,
                cancellationToken);

        if (assessee is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var updateResult = filing.UpdateDraft(
            request.SalaryIncome,
            request.HousePropertyIncome,
            request.BusinessIncome,
            request.CapitalGains,
            request.OtherIncome,
            request.CaNotes);

        if (updateResult.IsFailure)
            return Result<FilingDetailDto>.Failure(updateResult.Error);

        await dbContext.SaveChangesAsync(cancellationToken);

        // Return the updated filing in the same shape as GetFiling (FilingDetailDto)
        // so the admin panel can update its local state without a separate GET.
        return new FilingDetailDto(
            filing.Id, filing.AssesseeId, filing.AssessmentYear, filing.ItrFormType,
            filing.Regime, filing.Status,
            filing.TaxSlabVersionId, filing.ComputationHash,
            filing.SalaryIncome, filing.HousePropertyIncome, filing.BusinessIncome,
            filing.CapitalGains, filing.OtherIncome, filing.TotalDeductions,
            filing.AcknowledgementNumber, filing.FiledAt, filing.EVerifiedAt,
            filing.ReviewedByCaId, filing.CaRejectionReason,
            filing.CreatedAt, filing.UpdatedAt,
            assessee.FullName, assessee.PanLast4,
            filing.CaNotes);
    }
}
