using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetProfitAndLoss;

/// <summary>
/// Returns a Profit and Loss statement for the given org and financial year.
/// Income accounts minus Expense accounts = Net Profit/Loss.
/// </summary>
public record GetProfitAndLossQuery(Guid OrgId, int FyYear, int? PeriodMonth = null) : IQuery<ProfitAndLossDto>;

/// <summary>P&amp;L report DTO.</summary>
public record ProfitAndLossDto(
    Guid OrgId,
    int FyYear,
    int? PeriodMonth,
    IReadOnlyList<PnlLine> IncomeLines,
    IReadOnlyList<PnlLine> ExpenseLines,
    decimal TotalIncome,
    decimal TotalExpenses,
    decimal NetProfit);

/// <summary>One account line in the P&amp;L.</summary>
public record PnlLine(string AccountCode, string AccountName, decimal Amount);

/// <summary>Validates the P&amp;L query.</summary>
public sealed class GetProfitAndLossQueryValidator : AbstractValidator<GetProfitAndLossQuery>
{
    public GetProfitAndLossQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
        RuleFor(x => x.PeriodMonth).InclusiveBetween(1, 12).When(x => x.PeriodMonth.HasValue);
    }
}

/// <summary>Handles <see cref="GetProfitAndLossQuery"/>.</summary>
public sealed class GetProfitAndLossQueryHandler(IAccountingDbContext dbContext)
    : IQueryHandler<GetProfitAndLossQuery, ProfitAndLossDto>
{
    /// <inheritdoc />
    public async Task<Result<ProfitAndLossDto>> Handle(
        GetProfitAndLossQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.LedgerEntries
            .Where(e => e.OrgId == request.OrgId
                     && e.FyYear == request.FyYear
                     && e.Status == Domain.Entities.PostingStatus.Approved
                     && e.DeletedAt == null);

        if (request.PeriodMonth.HasValue)
            query = query.Where(e => e.PeriodMonth == request.PeriodMonth.Value);

        var entries = await query.ToListAsync(cancellationToken);
        var accounts = await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId && a.DeletedAt == null)
            .ToDictionaryAsync(a => a.Id, cancellationToken);

        // Income = credit side of INCOME accounts
        var incomeLines = BuildLines(entries, accounts, "INCOME", isCredit: true);
        var expenseLines = BuildLines(entries, accounts, "EXPENSE", isCredit: false);

        var totalIncome = incomeLines.Sum(l => l.Amount);
        var totalExpenses = expenseLines.Sum(l => l.Amount);

        return new ProfitAndLossDto(
            request.OrgId,
            request.FyYear,
            request.PeriodMonth,
            incomeLines,
            expenseLines,
            totalIncome,
            totalExpenses,
            totalIncome - totalExpenses);
    }

    private static List<PnlLine> BuildLines(
        IEnumerable<Domain.Entities.LedgerEntry> entries,
        Dictionary<Guid, Domain.Entities.ChartOfAccount> accounts,
        string accountType,
        bool isCredit)
    {
        var relevantAccountIds = accounts
            .Where(kvp => kvp.Value.AccountType == accountType)
            .Select(kvp => kvp.Key)
            .ToHashSet();

        return entries
            .Select(e =>
            {
                if (isCredit && relevantAccountIds.Contains(e.CreditAccountId))
                    return ((Guid?)e.CreditAccountId, e.Amount);
                if (!isCredit && relevantAccountIds.Contains(e.DebitAccountId))
                    return ((Guid?)e.DebitAccountId, e.Amount);
                return ((Guid?)null, 0m);
            })
            .Where(x => x.Item1.HasValue)
            .GroupBy(x => x.Item1!.Value)
            .Select(g =>
            {
                var acc = accounts.GetValueOrDefault(g.Key);
                return new PnlLine(
                    acc?.AccountCode ?? g.Key.ToString()[..8],
                    acc?.AccountName ?? "Unknown",
                    g.Sum(x => x.Item2));
            })
            .OrderBy(l => l.AccountCode)
            .ToList();
    }
}
