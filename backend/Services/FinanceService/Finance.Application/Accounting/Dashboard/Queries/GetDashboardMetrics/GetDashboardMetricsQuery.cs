using AccountingService.Application.Common.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Dashboard.Queries.GetDashboardMetrics;

/// <summary>
/// DG-DASH-01: Mobile Home dashboard KPI metrics.
/// Returns totalSales, totalExpenses, netPnL, gstPayable, salesTrend, expensesTrend, period
/// org-scoped to the caller's organisation for the current Indian financial year.
/// </summary>
[RequiresPermission("accounting.reports.read")]
public record GetDashboardMetricsQuery(Guid OrgId) : IQuery<DashboardMetricsDto>;

/// <summary>
/// Dashboard KPI response — matches DashboardMetrics interface in mobile HomeScreen.tsx.
/// All monetary values are in INR (decimal, never float/double).
/// </summary>
/// <param name="TotalSales">Total income (credit side of INCOME accounts) for the current FY.</param>
/// <param name="TotalExpenses">Total expenses (debit side of EXPENSE accounts) for the current FY.</param>
/// <param name="NetPnL">Net profit/loss = TotalSales − TotalExpenses.</param>
/// <param name="GstPayable">Sum of NetTaxPayable across non-FILED GST returns for the org.</param>
/// <param name="SalesTrend">Month-over-month sales growth % (current vs prior month). 0 if no prior month data.</param>
/// <param name="ExpensesTrend">Month-over-month expenses change % (current vs prior month). 0 if no prior month data.</param>
/// <param name="Period">Human-readable FY label, e.g. "FY 2025-26".</param>
public record DashboardMetricsDto(
    decimal TotalSales,
    decimal TotalExpenses,
    decimal NetPnL,
    decimal GstPayable,
    decimal SalesTrend,
    decimal ExpensesTrend,
    string Period);

/// <summary>Validates GetDashboardMetricsQuery.</summary>
public sealed class GetDashboardMetricsQueryValidator : AbstractValidator<GetDashboardMetricsQuery>
{
    public GetDashboardMetricsQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
    }
}

/// <summary>
/// Intermediate projection for per-period aggregation — avoids anonymous types across
/// cross-FY ledger queries while remaining EF-translatable.
/// </summary>
internal record LedgerPeriodRow(int? PeriodMonth, Guid CreditAccountId, Guid DebitAccountId, decimal Amount);

/// <summary>
/// Handles <see cref="GetDashboardMetricsQuery"/>.
/// Aggregates from accounting.ledger_entries (INCOME/EXPENSE accounts, approved entries)
/// and gst.gst_returns (NetTaxPayable for pending returns).
/// Indian FY: April = period month 1, March = period month 12.
/// </summary>
public sealed class GetDashboardMetricsQueryHandler(
    IAccountingDbContext accountingDb,
    IGstDbContext gstDb)
    : IQueryHandler<GetDashboardMetricsQuery, DashboardMetricsDto>
{
    /// <inheritdoc />
    public async Task<Result<DashboardMetricsDto>> Handle(
        GetDashboardMetricsQuery request,
        CancellationToken cancellationToken)
    {
        // ── Determine current Indian FY year and period month ─────────────────
        // Indian FY: April 1 to March 31. If calendar month < 4 (Jan-Mar) we are in prior FY.
        var now = DateTime.UtcNow;
        var fyYear = now.Month >= 4 ? now.Year : now.Year - 1;

        // Indian FY period month: April=1, May=2, ..., December=9, January=10, February=11, March=12
        var currentPeriod = now.Month >= 4 ? now.Month - 3 : now.Month + 9;
        var priorPeriod = currentPeriod == 1 ? 12 : currentPeriod - 1;
        // If priorPeriod > currentPeriod we rolled back to March, which is in the prior FY
        var priorFyYear = priorPeriod > currentPeriod ? fyYear - 1 : fyYear;

        var periodLabel = $"FY {fyYear}-{(fyYear + 1) % 100:D2}";

        // ── Resolve INCOME and EXPENSE account IDs for this org ──────────────
        var coaAccounts = await accountingDb.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId
                     && a.DeletedAt == null
                     && (a.AccountType == "INCOME" || a.AccountType == "EXPENSE"))
            .Select(a => new { a.Id, a.AccountType })
            .ToListAsync(cancellationToken);

        var incomeAccountIds = coaAccounts
            .Where(a => a.AccountType == "INCOME")
            .Select(a => a.Id)
            .ToHashSet();

        var expenseAccountIds = coaAccounts
            .Where(a => a.AccountType == "EXPENSE")
            .Select(a => a.Id)
            .ToHashSet();

        var allAccountIds = incomeAccountIds.Union(expenseAccountIds).ToHashSet();

        if (allAccountIds.Count == 0)
        {
            // No COA set up yet — return zeros with a valid period label.
            return new DashboardMetricsDto(0m, 0m, 0m, 0m, 0m, 0m, periodLabel);
        }

        // ── Pull approved FY ledger entries touching INCOME/EXPENSE accounts ─
        var fyEntries = await FetchLedgerRowsAsync(
            request.OrgId, fyYear, allAccountIds, cancellationToken);

        // ── YTD totals ────────────────────────────────────────────────────────
        decimal totalSales = fyEntries
            .Where(e => incomeAccountIds.Contains(e.CreditAccountId))
            .Sum(e => e.Amount);

        decimal totalExpenses = fyEntries
            .Where(e => expenseAccountIds.Contains(e.DebitAccountId))
            .Sum(e => e.Amount);

        // ── Current-period totals (MoM numerator) ─────────────────────────────
        decimal currentSales = fyEntries
            .Where(e => e.PeriodMonth == currentPeriod
                     && incomeAccountIds.Contains(e.CreditAccountId))
            .Sum(e => e.Amount);

        decimal currentExpenses = fyEntries
            .Where(e => e.PeriodMonth == currentPeriod
                     && expenseAccountIds.Contains(e.DebitAccountId))
            .Sum(e => e.Amount);

        // ── Prior-period totals (MoM denominator) ─────────────────────────────
        IReadOnlyList<LedgerPeriodRow> priorEntries;

        if (priorFyYear == fyYear)
        {
            // Prior period is within the same FY — filter in-memory
            priorEntries = fyEntries
                .Where(e => e.PeriodMonth == priorPeriod)
                .ToList();
        }
        else
        {
            // Prior period is in the previous FY (edge case: current period = April = period 1)
            priorEntries = await FetchLedgerRowsAsync(
                request.OrgId, priorFyYear, allAccountIds, cancellationToken);
            priorEntries = priorEntries
                .Where(e => e.PeriodMonth == priorPeriod)
                .ToList();
        }

        decimal priorSales = priorEntries
            .Where(e => incomeAccountIds.Contains(e.CreditAccountId))
            .Sum(e => e.Amount);

        decimal priorExpenses = priorEntries
            .Where(e => expenseAccountIds.Contains(e.DebitAccountId))
            .Sum(e => e.Amount);

        // MoM % — 0 when no prior data to avoid division by zero
        decimal salesTrend = priorSales == 0m
            ? 0m
            : Math.Round((currentSales - priorSales) / priorSales * 100m, 1);

        decimal expensesTrend = priorExpenses == 0m
            ? 0m
            : Math.Round((currentExpenses - priorExpenses) / priorExpenses * 100m, 1);

        // ── GST payable — NetTaxPayable on open (non-FILED) returns for this org ─
        decimal gstPayable = await gstDb.GstReturns
            .Where(r => r.OrganizationId == request.OrgId
                     && r.DeletedAt == null
                     && r.Status != "FILED")
            .SumAsync(r => r.NetTaxPayable, cancellationToken);

        return new DashboardMetricsDto(
            TotalSales: Math.Round(totalSales, 2),
            TotalExpenses: Math.Round(totalExpenses, 2),
            NetPnL: Math.Round(totalSales - totalExpenses, 2),
            GstPayable: Math.Round(gstPayable, 2),
            SalesTrend: salesTrend,
            ExpensesTrend: expensesTrend,
            Period: periodLabel);
    }

    /// <summary>
    /// Fetches all approved ledger rows for the org + FY that touch any of the
    /// supplied account IDs. Returns a lightweight projection for in-memory aggregation.
    /// </summary>
    private async Task<IReadOnlyList<LedgerPeriodRow>> FetchLedgerRowsAsync(
        Guid orgId,
        int fyYear,
        HashSet<Guid> accountIds,
        CancellationToken ct)
    {
        return await accountingDb.LedgerEntries
            .Where(e => e.OrgId == orgId
                     && e.FyYear == fyYear
                     && e.Status == PostingStatus.Approved
                     && e.DeletedAt == null
                     && (accountIds.Contains(e.CreditAccountId)
                         || accountIds.Contains(e.DebitAccountId)))
            .Select(e => new LedgerPeriodRow(e.PeriodMonth, e.CreditAccountId, e.DebitAccountId, e.Amount))
            .ToListAsync(ct);
    }
}
