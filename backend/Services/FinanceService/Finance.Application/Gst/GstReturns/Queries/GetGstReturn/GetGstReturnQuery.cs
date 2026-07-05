using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Queries.GetGstReturn;

public record GetGstReturnQuery(Guid GstReturnId) : IQuery<GstReturnDto>;

/// <summary>
/// Read-side DTO for a GST return.
/// DG-GST-04: <see cref="LateFeeAmount"/> and <see cref="InterestAmount"/> are now populated
/// from the domain entity; they are zero when the return was filed on time.
/// </summary>
public record GstReturnDto(
    Guid Id,
    string ReturnType,
    string FinancialYear,
    int? PeriodMonth,
    string Gstin,
    string Status,
    decimal TotalTaxableValue,
    decimal TotalIgst,
    decimal TotalCgst,
    decimal TotalSgst,
    decimal TotalCess,
    decimal NetTaxPayable,
    /// <summary>DG-GST-04: Late fee in INR (0 when filed on time or before computation).</summary>
    decimal LateFeeAmount,
    /// <summary>DG-GST-04: Interest on net tax payable in INR (0 when filed on time).</summary>
    decimal InterestAmount,
    DateOnly? FilingDeadline,
    string? ArnNumber,
    DateTime? FiledAt);

/// <summary>
/// Read-side query handler that uses <see cref="IGstReturnRepository"/> to fetch
/// the aggregate with its line items. The repository loads the full graph;
/// a flat DTO projection is then applied in-memory.
/// Justified use of the repository on the query side: the return aggregate is
/// small and the projection is trivial — no separate read model is warranted yet.
/// </summary>
public sealed class GetGstReturnQueryHandler(IGstReturnRepository repository)
    : IQueryHandler<GetGstReturnQuery, GstReturnDto>
{
    /// <inheritdoc />
    public async Task<Result<GstReturnDto>> Handle(
        GetGstReturnQuery request,
        CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Error.NotFound("GstReturn", request.GstReturnId);

        return new GstReturnDto(
            gstReturn.Id,
            gstReturn.ReturnType,
            gstReturn.FinancialYear,
            gstReturn.PeriodMonth,
            gstReturn.Gstin,
            gstReturn.Status,
            gstReturn.TotalTaxableValue,
            gstReturn.TotalIgst,
            gstReturn.TotalCgst,
            gstReturn.TotalSgst,
            gstReturn.TotalCess,
            gstReturn.NetTaxPayable,
            gstReturn.LateFeeAmount,
            gstReturn.InterestAmount,
            gstReturn.FilingDeadline,
            gstReturn.ArnNumber,
            gstReturn.FiledAt);
    }
}
