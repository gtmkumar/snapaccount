using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetTrialBalance;

/// <summary>
/// Returns a trial balance for the given organisation and financial year.
/// Debits and credits must equal — a mismatch indicates a ledger integrity problem.
/// </summary>
public record GetTrialBalanceQuery(Guid OrgId, int FyYear) : IQuery<TrialBalanceDto>;

/// <summary>Trial balance DTO returned to the API consumer.</summary>
public record TrialBalanceDto(
    Guid OrgId,
    int FyYear,
    IReadOnlyList<TrialBalanceLine> Lines,
    decimal TotalDebits,
    decimal TotalCredits,
    bool IsBalanced);

/// <summary>One account line in the trial balance.</summary>
public record TrialBalanceLine(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal Balance);

/// <summary>Validates the trial balance query.</summary>
public sealed class GetTrialBalanceQueryValidator : AbstractValidator<GetTrialBalanceQuery>
{
    public GetTrialBalanceQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
    }
}

/// <summary>
/// Handles <see cref="GetTrialBalanceQuery"/>.
/// Direct LINQ projection from <see cref="IAccountingDbContext"/> (JT read-side pattern).
/// Enforces org_id scoping per security requirement.
/// </summary>
public sealed class GetTrialBalanceQueryHandler(IAccountingDbContext dbContext)
    : IQueryHandler<GetTrialBalanceQuery, TrialBalanceDto>
{
    /// <inheritdoc />
    public async Task<Result<TrialBalanceDto>> Handle(
        GetTrialBalanceQuery request,
        CancellationToken cancellationToken)
    {
        // Fetch all approved ledger entries for the org/FY
        var entries = await dbContext.LedgerEntries
            .Where(e => e.OrgId == request.OrgId
                     && e.FyYear == request.FyYear
                     && e.Status == Domain.Entities.PostingStatus.Approved
                     && e.DeletedAt == null)
            .ToListAsync(cancellationToken);

        // Fetch chart of accounts for the org for display names
        var accounts = await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId && a.IsActive && a.DeletedAt == null)
            .ToDictionaryAsync(a => a.Id, cancellationToken);

        // Aggregate per debit account
        var debitTotals = entries.GroupBy(e => e.DebitAccountId)
            .ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

        // Aggregate per credit account
        var creditTotals = entries.GroupBy(e => e.CreditAccountId)
            .ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

        var allAccountIds = debitTotals.Keys.Union(creditTotals.Keys).ToHashSet();

        var lines = allAccountIds.Select(id =>
        {
            var debit = debitTotals.GetValueOrDefault(id);
            var credit = creditTotals.GetValueOrDefault(id);
            var acc = accounts.GetValueOrDefault(id);
            return new TrialBalanceLine(
                id,
                acc?.AccountCode ?? id.ToString()[..8],
                acc?.AccountName ?? "Unknown",
                acc?.AccountType ?? "UNKNOWN",
                debit,
                credit,
                debit - credit);
        })
        .OrderBy(l => l.AccountCode)
        .ToList();

        var totalDebits = lines.Sum(l => l.TotalDebit);
        var totalCredits = lines.Sum(l => l.TotalCredit);

        return new TrialBalanceDto(
            request.OrgId,
            request.FyYear,
            lines,
            totalDebits,
            totalCredits,
            totalDebits == totalCredits);
    }
}
