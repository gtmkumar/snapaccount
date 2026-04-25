using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.ItcReconciliation.Queries.GetItcMismatches;

public record GetItcMismatchesQuery(Guid OrganizationId, string? Status = "OPEN")
    : IQuery<IReadOnlyList<ItcMismatchDto>>;

public record ItcMismatchDto(
    Guid Id,
    string MismatchType,
    decimal ClaimedAmount,
    decimal AvailableAmount,
    decimal DifferenceAmount,
    string Status);

/// <summary>
/// Read-side query using <see cref="IItcMismatchReadRepository"/> for ITC mismatch projections.
/// This is the JT CQRS pattern: queries use a purpose-built read interface that
/// returns DTOs directly, isolating the read side from aggregate loading concerns.
/// </summary>
public sealed class GetItcMismatchesQueryHandler(IItcMismatchReadRepository readRepository)
    : IQueryHandler<GetItcMismatchesQuery, IReadOnlyList<ItcMismatchDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<ItcMismatchDto>>> Handle(
        GetItcMismatchesQuery request,
        CancellationToken cancellationToken)
    {
        var mismatches = await readRepository.GetByOrganizationAsync(
            request.OrganizationId, request.Status, cancellationToken);
        return Result<IReadOnlyList<ItcMismatchDto>>.Success(mismatches);
    }
}
