using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetBalanceSheet;

/// <summary>Returns the Balance Sheet (Assets = Liabilities + Equity) for an org/FY.</summary>
public record GetBalanceSheetQuery(Guid OrgId, int FyYear) : IQuery<BalanceSheetDto>;

/// <summary>Balance sheet DTO.</summary>
public record BalanceSheetDto(
    Guid OrgId,
    int FyYear,
    IReadOnlyList<BalanceSheetLine> AssetLines,
    IReadOnlyList<BalanceSheetLine> LiabilityLines,
    IReadOnlyList<BalanceSheetLine> EquityLines,
    decimal TotalAssets,
    decimal TotalLiabilities,
    decimal TotalEquity,
    bool IsBalanced);

/// <summary>One account line on the balance sheet.</summary>
public record BalanceSheetLine(string AccountCode, string AccountName, decimal Balance);

/// <summary>Validates the balance sheet query.</summary>
public sealed class GetBalanceSheetQueryValidator : AbstractValidator<GetBalanceSheetQuery>
{
    public GetBalanceSheetQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
    }
}

/// <summary>Handles <see cref="GetBalanceSheetQuery"/>.</summary>
public sealed class GetBalanceSheetQueryHandler(IAccountingDbContext dbContext)
    : IQueryHandler<GetBalanceSheetQuery, BalanceSheetDto>
{
    /// <inheritdoc />
    public async Task<Result<BalanceSheetDto>> Handle(
        GetBalanceSheetQuery request,
        CancellationToken cancellationToken)
    {
        var entries = await dbContext.LedgerEntries
            .Where(e => e.OrgId == request.OrgId
                     && e.FyYear == request.FyYear
                     && e.Status == Domain.Entities.PostingStatus.Approved
                     && e.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var accounts = await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId && a.DeletedAt == null)
            .ToDictionaryAsync(a => a.Id, cancellationToken);

        var assetLines = BuildLines(entries, accounts, "ASSET");
        var liabilityLines = BuildLines(entries, accounts, "LIABILITY");
        var equityLines = BuildLines(entries, accounts, "EQUITY");

        var totalAssets = assetLines.Sum(l => l.Balance);
        var totalLiabilities = liabilityLines.Sum(l => l.Balance);
        var totalEquity = equityLines.Sum(l => l.Balance);

        return new BalanceSheetDto(
            request.OrgId, request.FyYear,
            assetLines, liabilityLines, equityLines,
            totalAssets, totalLiabilities, totalEquity,
            IsBalanced: totalAssets == totalLiabilities + totalEquity);
    }

    private static List<BalanceSheetLine> BuildLines(
        IEnumerable<Domain.Entities.LedgerEntry> entries,
        Dictionary<Guid, Domain.Entities.ChartOfAccount> accounts,
        string accountType)
    {
        var relevantIds = accounts.Where(kv => kv.Value.AccountType == accountType).Select(kv => kv.Key).ToHashSet();
        var debitSums = entries.Where(e => relevantIds.Contains(e.DebitAccountId))
            .GroupBy(e => e.DebitAccountId).ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));
        var creditSums = entries.Where(e => relevantIds.Contains(e.CreditAccountId))
            .GroupBy(e => e.CreditAccountId).ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

        return relevantIds.Select(id =>
        {
            var acc = accounts[id];
            var debit = debitSums.GetValueOrDefault(id);
            var credit = creditSums.GetValueOrDefault(id);
            // Assets: natural debit balance; Liabilities/Equity: natural credit balance
            var balance = accountType == "ASSET" ? debit - credit : credit - debit;
            return new BalanceSheetLine(acc.AccountCode, acc.AccountName, balance);
        })
        .Where(l => l.Balance != 0)
        .OrderBy(l => l.AccountCode)
        .ToList();
    }
}
