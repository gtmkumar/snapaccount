using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.PartnerBanks.Queries.ListPartnerBanks;

/// <summary>
/// Returns a paginated list of partner banks.
/// Admin / DG-LOAN-01: GET /loans/banks
/// Matches admin PartnerBanksListSchema { items: PartnerBankSchema[], totalCount }.
/// PartnerBankSchema fields: bankId, name, logoUrl?, adapterType, contactEmail?,
///   isActive, lastSuccessfulSubmissionAt?, healthStatus?
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ListPartnerBanksQuery(
    int Page = 1,
    int PageSize = 20) : IQuery<ListPartnerBanksResponse>;

/// <summary>Paginated response matching admin PartnerBanksListSchema.</summary>
public record ListPartnerBanksResponse(
    IReadOnlyList<PartnerBankListDto> Items,
    int TotalCount);

/// <summary>
/// Partner bank list DTO matching admin PartnerBankSchema.
/// NOTE: api_config_encrypted / api key / client secret are NEVER returned (write-only fields).
/// </summary>
public record PartnerBankListDto(
    Guid BankId,
    string Name,
    string? LogoUrl,
    string AdapterType,
    string? ContactEmail,
    bool IsActive,
    DateTime? LastSuccessfulSubmissionAt,
    string? HealthStatus);

/// <summary>Handler: returns paginated partner banks list (admin view).</summary>
public sealed class ListPartnerBanksQueryHandler(
    ILoanServiceDbContext db) : IQueryHandler<ListPartnerBanksQuery, ListPartnerBanksResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListPartnerBanksResponse>> Handle(
        ListPartnerBanksQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.PartnerBanks
            .Where(b => b.DeletedAt == null)
            .OrderBy(b => b.Name);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(b => new PartnerBankListDto(
                b.Id,
                b.Name,
                b.LogoUrl,
                b.AdapterType.ToString().ToUpperInvariant(),
                b.ContactEmail,
                b.IsActive,
                null,         // LastSuccessfulSubmissionAt: not tracked yet
                b.IsActive ? "healthy" : "inactive"))
            .ToListAsync(cancellationToken);

        return new ListPartnerBanksResponse(items, total);
    }
}
