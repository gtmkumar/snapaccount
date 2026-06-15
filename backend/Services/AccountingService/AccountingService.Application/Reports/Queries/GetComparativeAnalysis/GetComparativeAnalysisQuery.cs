using AccountingService.Application.Common.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetComparativeAnalysis;

/// <summary>
/// GAP-044: Pure-SQL comparative analysis — Year-over-Year (YoY) and Month-over-Month (MoM)
/// for revenue / expense / profit by month over a requested financial year range.
///
/// Org-scoped. RBAC = existing <c>accounting.reports.read</c> permission.
/// No AI dependency — pure LINQ aggregation over <c>accounting.ledger_entries</c>.
///
/// Shape: chart-friendly DTOs with <c>labels</c> (month strings) and parallel <c>series</c> arrays
/// so the frontend can pass them directly to Chart.js / Recharts without transformation.
/// </summary>
[RequiresPermission("accounting.reports.read")]
public record GetComparativeAnalysisQuery(
    Guid OrgId,
    /// <summary>Base financial year (e.g. 2026 = FY2025-26).</summary>
    int BaseYear,
    /// <summary>Prior financial year for YoY comparison (default: BaseYear - 1).</summary>
    int? PriorYear = null,
    /// <summary>
    /// Optional filter: restrict to a specific ledger category (INCOME / EXPENSE / ASSET / LIABILITY).
    /// Null = return all categories.
    /// </summary>
    string? CategoryFilter = null) : IQuery<ComparativeAnalysisResponse>;

// ── Response DTOs ─────────────────────────────────────────────────────────────

/// <summary>Top-level comparative analysis response — chart-ready format.</summary>
public record ComparativeAnalysisResponse(
    Guid OrgId,
    int BaseYear,
    int PriorYear,
    /// <summary>Month labels in Indian FY order: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar.</summary>
    IReadOnlyList<string> Labels,
    /// <summary>Revenue (INCOME accounts, credit side) for the base year per month.</summary>
    IReadOnlyList<decimal> BaseRevenue,
    /// <summary>Revenue for the prior year per month (aligned to Labels).</summary>
    IReadOnlyList<decimal> PriorRevenue,
    /// <summary>Expense (EXPENSE accounts, debit side) for the base year per month.</summary>
    IReadOnlyList<decimal> BaseExpense,
    /// <summary>Expense for the prior year per month.</summary>
    IReadOnlyList<decimal> PriorExpense,
    /// <summary>Profit = Revenue − Expense for base year per month.</summary>
    IReadOnlyList<decimal> BaseProfit,
    /// <summary>Profit for prior year per month.</summary>
    IReadOnlyList<decimal> PriorProfit,
    /// <summary>YoY revenue growth per month (null when prior = 0 to avoid ÷0).</summary>
    IReadOnlyList<decimal?> YoYRevenueGrowth,
    /// <summary>MoM revenue change for the base year (null for first month).</summary>
    IReadOnlyList<decimal?> MoMBaseRevenue,
    /// <summary>Top movers: ledger categories with the largest absolute change base vs prior year.</summary>
    IReadOnlyList<TopMoverDto> TopMovers);

/// <summary>A ledger category that moved significantly between base and prior year.</summary>
public record TopMoverDto(
    string AccountCode,
    string AccountName,
    string AccountType,
    decimal BaseYearTotal,
    decimal PriorYearTotal,
    decimal AbsoluteChange,
    decimal? PercentChange);

// ── Validator ─────────────────────────────────────────────────────────────────

/// <summary>Validates GetComparativeAnalysisQuery.</summary>
public sealed class GetComparativeAnalysisQueryValidator : AbstractValidator<GetComparativeAnalysisQuery>
{
    public GetComparativeAnalysisQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.BaseYear).InclusiveBetween(2020, 2100);
        RuleFor(x => x.PriorYear)
            .InclusiveBetween(2020, 2100)
            .LessThan(x => x.BaseYear)
            .When(x => x.PriorYear.HasValue);
        RuleFor(x => x.CategoryFilter)
            .Must(c => c is null or "INCOME" or "EXPENSE" or "ASSET" or "LIABILITY")
            .WithMessage("CategoryFilter must be one of: INCOME, EXPENSE, ASSET, LIABILITY.")
            .When(x => x.CategoryFilter is not null);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// <summary>
/// Projects comparative monthly totals from <c>accounting.ledger_entries</c>
/// using LINQ aggregation (pure SQL — no AI, no external calls).
/// Indian FY: month 1 = April, month 12 = March.
/// </summary>
public sealed class GetComparativeAnalysisQueryHandler(IAccountingDbContext db)
    : IQueryHandler<GetComparativeAnalysisQuery, ComparativeAnalysisResponse>
{
    // Indian FY: April (month 4 calendar) = period 1, March (month 3 calendar) = period 12
    private static readonly string[] MonthLabels =
        ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

    /// <inheritdoc />
    public async Task<Result<ComparativeAnalysisResponse>> Handle(
        GetComparativeAnalysisQuery request,
        CancellationToken cancellationToken)
    {
        var priorYear = request.PriorYear ?? (request.BaseYear - 1);

        // ── Pull approved ledger entries for both years ───────────────────────
        var baseEntries = await FetchMonthlyTotalsAsync(
            request.OrgId, request.BaseYear, request.CategoryFilter, cancellationToken);
        var priorEntries = await FetchMonthlyTotalsAsync(
            request.OrgId, priorYear, request.CategoryFilter, cancellationToken);

        // ── Build 12-slot arrays (period 1..12) ───────────────────────────────
        var baseRevenue = BuildSeries(baseEntries, "INCOME", isCredit: true);
        var priorRevenue = BuildSeries(priorEntries, "INCOME", isCredit: true);
        var baseExpense = BuildSeries(baseEntries, "EXPENSE", isCredit: false);
        var priorExpense = BuildSeries(priorEntries, "EXPENSE", isCredit: false);

        var baseProfit = Enumerable.Range(0, 12)
            .Select(i => baseRevenue[i] - baseExpense[i])
            .ToArray();
        var priorProfit = Enumerable.Range(0, 12)
            .Select(i => priorRevenue[i] - priorExpense[i])
            .ToArray();

        // ── YoY growth per month ──────────────────────────────────────────────
        var yoyRevenue = Enumerable.Range(0, 12)
            .Select(i => priorRevenue[i] == 0m
                ? (decimal?)null
                : (baseRevenue[i] - priorRevenue[i]) / priorRevenue[i] * 100m)
            .ToArray();

        // ── MoM change for base year ──────────────────────────────────────────
        var momBase = Enumerable.Range(0, 12)
            .Select(i =>
            {
                if (i == 0) return (decimal?)null;
                var prev = baseRevenue[i - 1];
                return prev == 0m ? (decimal?)null : (baseRevenue[i] - prev) / prev * 100m;
            })
            .ToArray();

        // ── Top movers by ledger category (up to 10) ─────────────────────────
        var topMovers = await BuildTopMoversAsync(
            request.OrgId, request.BaseYear, priorYear, request.CategoryFilter, cancellationToken);

        return new ComparativeAnalysisResponse(
            OrgId: request.OrgId,
            BaseYear: request.BaseYear,
            PriorYear: priorYear,
            Labels: MonthLabels,
            BaseRevenue: baseRevenue,
            PriorRevenue: priorRevenue,
            BaseExpense: baseExpense,
            PriorExpense: priorExpense,
            BaseProfit: baseProfit,
            PriorProfit: priorProfit,
            YoYRevenueGrowth: yoyRevenue,
            MoMBaseRevenue: momBase,
            TopMovers: topMovers);
    }

    /// <summary>
    /// Fetches per-period-month aggregated totals for a given org and year.
    /// Returns a list of (PeriodMonth, AccountId, AccountType, DebitTotal, CreditTotal).
    /// </summary>
    private async Task<List<MonthlyAccountTotal>> FetchMonthlyTotalsAsync(
        Guid orgId, int fyYear, string? categoryFilter, CancellationToken ct)
    {
        string[] accountTypes = categoryFilter is null
            ? ["INCOME", "EXPENSE", "ASSET", "LIABILITY"]
            : [categoryFilter];

        // Resolve relevant account IDs for the org
        var accounts = await db.ChartOfAccounts
            .Where(a => a.OrgId == orgId
                        && a.DeletedAt == null
                        && accountTypes.Contains(a.AccountType))
            .Select(a => new { a.Id, a.AccountType, a.AccountCode, a.AccountName })
            .ToListAsync(ct);

        var accountIdSet = accounts.Select(a => a.Id).ToHashSet();
        if (accountIdSet.Count == 0)
            return [];

        // Aggregate debit/credit per account per period month
        var ledgerRaw = await db.LedgerEntries
            .Where(e => e.OrgId == orgId
                        && e.FyYear == fyYear
                        && e.Status == PostingStatus.Approved
                        && e.DeletedAt == null
                        && e.PeriodMonth != null
                        && (accountIdSet.Contains(e.DebitAccountId)
                            || accountIdSet.Contains(e.CreditAccountId)))
            .Select(e => new
            {
                e.PeriodMonth,
                e.DebitAccountId,
                e.CreditAccountId,
                e.Amount
            })
            .ToListAsync(ct);

        // Flatten to per-account-per-month totals
        var debitTotals = ledgerRaw
            .Where(e => accountIdSet.Contains(e.DebitAccountId))
            .GroupBy(e => (e.PeriodMonth!.Value, e.DebitAccountId))
            .Select(g => new MonthlyAccountTotal(
                g.Key.Value,
                g.Key.DebitAccountId,
                DebitTotal: g.Sum(e => e.Amount),
                CreditTotal: 0m));

        var creditTotals = ledgerRaw
            .Where(e => accountIdSet.Contains(e.CreditAccountId))
            .GroupBy(e => (e.PeriodMonth!.Value, e.CreditAccountId))
            .Select(g => new MonthlyAccountTotal(
                g.Key.Value,
                g.Key.CreditAccountId,
                DebitTotal: 0m,
                CreditTotal: g.Sum(e => e.Amount)));

        var combined = debitTotals.Concat(creditTotals)
            .GroupBy(x => (x.PeriodMonth, x.AccountId))
            .Select(g => new MonthlyAccountTotal(
                g.Key.PeriodMonth,
                g.Key.AccountId,
                DebitTotal: g.Sum(x => x.DebitTotal),
                CreditTotal: g.Sum(x => x.CreditTotal)))
            .ToList();

        // Attach account metadata
        var accountMap = accounts.ToDictionary(a => a.Id);
        return combined
            .Where(x => accountMap.ContainsKey(x.AccountId))
            .Select(x =>
            {
                var acc = accountMap[x.AccountId];
                return new MonthlyAccountTotal(x.PeriodMonth, x.AccountId, x.DebitTotal, x.CreditTotal,
                    acc.AccountType, acc.AccountCode, acc.AccountName);
            })
            .ToList();
    }

    /// <summary>Builds a 12-slot decimal array indexed by FY period (1-based → index 0).</summary>
    private static decimal[] BuildSeries(
        List<MonthlyAccountTotal> entries,
        string accountType,
        bool isCredit)
    {
        var result = new decimal[12];
        foreach (var entry in entries.Where(e => e.AccountType == accountType))
        {
            var idx = entry.PeriodMonth - 1; // period 1 = April = index 0
            if (idx is < 0 or > 11) continue;
            result[idx] += isCredit ? entry.CreditTotal : entry.DebitTotal;
        }
        return result;
    }

    /// <summary>Builds top-10 movers by absolute change between base and prior year.</summary>
    private async Task<List<TopMoverDto>> BuildTopMoversAsync(
        Guid orgId, int baseYear, int priorYear, string? categoryFilter, CancellationToken ct)
    {
        var accountTypes = categoryFilter is null
            ? ["INCOME", "EXPENSE"]
            : (categoryFilter is "INCOME" or "EXPENSE" ? [categoryFilter] : new string[0]);

        if (accountTypes.Length == 0) return [];

        var accounts = await db.ChartOfAccounts
            .Where(a => a.OrgId == orgId && a.DeletedAt == null && accountTypes.Contains(a.AccountType))
            .ToListAsync(ct);

        var accountIdSet = accounts.Select(a => a.Id).ToHashSet();
        if (accountIdSet.Count == 0) return [];

        // Base year totals
        var baseQuery = await db.LedgerEntries
            .Where(e => e.OrgId == orgId && e.FyYear == baseYear
                        && e.Status == PostingStatus.Approved && e.DeletedAt == null)
            .ToListAsync(ct);

        var priorQuery = await db.LedgerEntries
            .Where(e => e.OrgId == orgId && e.FyYear == priorYear
                        && e.Status == PostingStatus.Approved && e.DeletedAt == null)
            .ToListAsync(ct);

        var accountMap = accounts.ToDictionary(a => a.Id);

        decimal GetAccountYearTotal(IEnumerable<LedgerEntry> entries, Guid accountId, bool isIncome)
        {
            return entries.Where(e => isIncome
                    ? e.CreditAccountId == accountId
                    : e.DebitAccountId == accountId)
                .Sum(e => e.Amount);
        }

        var movers = accounts.Select(acc =>
        {
            var isIncome = acc.AccountType == "INCOME";
            var baseTotal = GetAccountYearTotal(baseQuery, acc.Id, isIncome);
            var priorTotal = GetAccountYearTotal(priorQuery, acc.Id, isIncome);
            var change = baseTotal - priorTotal;
            var pct = priorTotal == 0m ? (decimal?)null : change / priorTotal * 100m;
            return new TopMoverDto(acc.AccountCode, acc.AccountName, acc.AccountType,
                baseTotal, priorTotal, Math.Abs(change), pct);
        })
        .Where(m => m.AbsoluteChange > 0)
        .OrderByDescending(m => m.AbsoluteChange)
        .Take(10)
        .ToList();

        return movers;
    }

    private record MonthlyAccountTotal(
        int PeriodMonth,
        Guid AccountId,
        decimal DebitTotal,
        decimal CreditTotal,
        string? AccountType = null,
        string? AccountCode = null,
        string? AccountName = null);
}
