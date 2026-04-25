using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.GetFiling;

/// <summary>
/// Returns detailed filing information.
/// P6-HANDOFF-20: itr_v_uri not returned — caller calls GetItrVUrl endpoint separately.
/// SEC-039: org-scoped — verifies filing's assessee belongs to caller's organisation.
/// </summary>
public record GetFilingQuery(Guid FilingId) : IQuery<FilingDetailDto>;

public record FilingDetailDto(
    Guid Id, Guid AssesseeId, string AssessmentYear, string ItrFormType, string Regime,
    string Status, Guid? TaxSlabVersionId, string? ComputationHash, decimal SalaryIncome,
    decimal HousePropertyIncome, decimal BusinessIncome, decimal CapitalGains, decimal OtherIncome,
    decimal TotalDeductions, string? AcknowledgementNumber, DateTime? FiledAt, DateTime? EVerifiedAt,
    Guid? ReviewedByCaId, string? CaRejectionReason);

public sealed class GetFilingQueryValidator : AbstractValidator<GetFilingQuery>
{
    public GetFilingQueryValidator() { RuleFor(x => x.FilingId).NotEmpty(); }
}

public sealed class GetFilingQueryHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<GetFilingQuery, FilingDetailDto>
{
    public async Task<Result<FilingDetailDto>> Handle(GetFilingQuery request, CancellationToken cancellationToken)
    {
        var f = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);

        if (f is null) return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == f.AssesseeId && a.DeletedAt == null), cancellationToken);

        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        return new FilingDetailDto(f.Id, f.AssesseeId, f.AssessmentYear, f.ItrFormType, f.Regime, f.Status,
            f.TaxSlabVersionId, f.ComputationHash, f.SalaryIncome, f.HousePropertyIncome, f.BusinessIncome,
            f.CapitalGains, f.OtherIncome, f.TotalDeductions, f.AcknowledgementNumber, f.FiledAt, f.EVerifiedAt,
            f.ReviewedByCaId, f.CaRejectionReason);
    }
}
