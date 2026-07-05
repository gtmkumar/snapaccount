using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Queries.GetFiling;

/// <summary>
/// Returns detailed filing information.
/// P6-HANDOFF-20: itr_v_uri not returned — caller calls GetItrVUrl endpoint separately.
/// SEC-039: org-scoped — verifies filing's assessee belongs to caller's organisation.
/// Now that itr.assessee_profiles has organization_id (db-engineer added column),
/// org isolation is enforced directly.
/// </summary>
public record GetFilingQuery(Guid FilingId) : IQuery<FilingDetailDto>;

/// <summary>
/// Detailed filing DTO returned by GET /itr/filings/{id}.
/// DG-ITR-03: createdAt + updatedAt are REQUIRED by admin FilingSchema (Zod parse fails without them).
/// DG-ITR-04: caNotes is separate from caRejectionReason.
/// </summary>
public record FilingDetailDto(
    Guid Id, Guid AssesseeId, string AssessmentYear, string ItrFormType, string Regime,
    string Status, Guid? TaxSlabVersionId, string? ComputationHash, decimal SalaryIncome,
    decimal HousePropertyIncome, decimal BusinessIncome, decimal CapitalGains, decimal OtherIncome,
    decimal TotalDeductions, string? AcknowledgementNumber, DateTime? FiledAt, DateTime? EVerifiedAt,
    Guid? ReviewedByCaId, string? CaRejectionReason,
    // DG-ITR-03: timestamps required by admin FilingSchema
    DateTime CreatedAt, DateTime UpdatedAt,
    // DG-ITR-03: optional assessee name + masked PAN for admin header display
    string? AssesseeName, string? PanLast4,
    // DG-ITR-04: dedicated CA notes (not the rejection reason)
    string? CaNotes);

public sealed class GetFilingQueryValidator : AbstractValidator<GetFilingQuery>
{
    public GetFilingQueryValidator() { RuleFor(x => x.FilingId).NotEmpty(); }
}

public sealed class GetFilingQueryHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<GetFilingQuery, FilingDetailDto>
{
    public async Task<Result<FilingDetailDto>> Handle(GetFilingQuery request, CancellationToken cancellationToken)
    {
        var f = await dbContext.Filings
            .FirstOrDefaultAsync(f => f.Id == request.FilingId && f.DeletedAt == null, cancellationToken);

        if (f is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: org-scoped IDOR check — verify assessee belongs to caller's org.
        // organization_id is now available on assessee_profiles (DDL added by db-engineer).
        var assessee = await dbContext.Assessees
            .FirstOrDefaultAsync(
                a => a.Id == f.AssesseeId
                     && a.DeletedAt == null
                     && a.OrganizationId == currentUser.OrganizationId,
                cancellationToken);

        if (assessee is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        return new FilingDetailDto(
            f.Id, f.AssesseeId, f.AssessmentYear, f.ItrFormType, f.Regime, f.Status,
            f.TaxSlabVersionId, f.ComputationHash, f.SalaryIncome, f.HousePropertyIncome,
            f.BusinessIncome, f.CapitalGains, f.OtherIncome, f.TotalDeductions,
            f.AcknowledgementNumber, f.FiledAt, f.EVerifiedAt,
            f.ReviewedByCaId, f.CaRejectionReason,
            // DG-ITR-03: required timestamps
            f.CreatedAt, f.UpdatedAt,
            // DG-ITR-03: assessee name + masked PAN
            assessee.FullName, assessee.PanLast4,
            // DG-ITR-04: dedicated CA notes
            f.CaNotes);
    }
}
