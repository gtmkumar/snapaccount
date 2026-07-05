using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.PartnerBanks.Queries.GetPartnerBanks;

/// <summary>Returns the list of active partner banks. Note: API config is NEVER returned to clients.</summary>
public record GetPartnerBanksQuery(bool IncludeInactive = false) : IQuery<IReadOnlyList<PartnerBankDto>>;

/// <summary>
/// Partner bank DTO — NEVER includes encrypted API config or key references.
/// Bank adapter secrets must never be exposed via API.
/// </summary>
public record PartnerBankDto(
    Guid BankId,
    string Name,
    string? LogoUrl,
    string AdapterType,
    bool IsActive,
    bool HasApiConfig);

/// <summary>Handler: returns partner banks. No auth restriction — products are public.</summary>
public sealed class GetPartnerBanksQueryHandler(
    ILoanServiceDbContext db) : IQueryHandler<GetPartnerBanksQuery, IReadOnlyList<PartnerBankDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<PartnerBankDto>>> Handle(
        GetPartnerBanksQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.PartnerBanks
            .Where(b => b.DeletedAt == null);

        if (!request.IncludeInactive)
            query = query.Where(b => b.IsActive);

        var banks = await query
            .OrderBy(b => b.Name)
            .Select(b => new PartnerBankDto(
                b.Id,
                b.Name,
                b.LogoUrl,
                b.AdapterType.ToString(),
                b.IsActive,
                b.ApiConfigEncrypted != null))
            .ToListAsync(cancellationToken);

        return Result<IReadOnlyList<PartnerBankDto>>.Success(banks);
    }
}
