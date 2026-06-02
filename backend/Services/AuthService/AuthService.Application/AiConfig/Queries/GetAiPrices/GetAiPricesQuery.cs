using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Queries.GetAiPrices;

/// <summary>The maintained AI model price catalog (USD rates).</summary>
public record GetAiPricesQuery : IQuery<IReadOnlyList<AiPriceDto>>;

public record AiPriceDto(
    Guid Id, string Provider, string Model,
    decimal InputPerMillion, decimal OutputPerMillion, decimal PerPage, bool IsActive);

public sealed class GetAiPricesQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetAiPricesQuery, IReadOnlyList<AiPriceDto>>
{
    public async Task<Result<IReadOnlyList<AiPriceDto>>> Handle(GetAiPricesQuery request, CancellationToken ct)
    {
        var prices = await db.AiModelPrices.AsNoTracking()
            .Where(p => p.DeletedAt == null)
            .OrderBy(p => p.Provider).ThenBy(p => p.Model)
            .Select(p => new AiPriceDto(p.Id, p.Provider, p.Model,
                p.InputPerMillion, p.OutputPerMillion, p.PerPage, p.IsActive))
            .ToListAsync(ct);
        return prices;
    }
}
