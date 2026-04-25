using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetLedgerByAccount;

/// <summary>Returns all approved ledger entries for a specific account in an org/FY.</summary>
public record GetLedgerByAccountQuery(
    Guid OrgId,
    Guid AccountId,
    int FyYear,
    int? PeriodMonth = null) : IQuery<LedgerByAccountDto>;

/// <summary>Ledger account detail DTO.</summary>
public record LedgerByAccountDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    IReadOnlyList<LedgerEntryLine> Entries,
    decimal OpeningBalance,
    decimal ClosingBalance);

/// <summary>One entry line in the account ledger.</summary>
public record LedgerEntryLine(
    Guid EntryId,
    DateTimeOffset PostedAt,
    string Narration,
    decimal Debit,
    decimal Credit,
    decimal RunningBalance,
    string Source,
    string Status);

/// <summary>Validates the ledger query.</summary>
public sealed class GetLedgerByAccountQueryValidator : AbstractValidator<GetLedgerByAccountQuery>
{
    public GetLedgerByAccountQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
    }
}

/// <summary>Handles <see cref="GetLedgerByAccountQuery"/>.</summary>
public sealed class GetLedgerByAccountQueryHandler(IAccountingDbContext dbContext)
    : IQueryHandler<GetLedgerByAccountQuery, LedgerByAccountDto>
{
    /// <inheritdoc />
    public async Task<Result<LedgerByAccountDto>> Handle(
        GetLedgerByAccountQuery request,
        CancellationToken cancellationToken)
    {
        var account = await dbContext.ChartOfAccounts
            .FirstOrDefaultAsync(a => a.Id == request.AccountId && a.OrgId == request.OrgId && a.DeletedAt == null, cancellationToken);

        if (account is null)
            return Error.NotFound("ChartOfAccount", request.AccountId);

        var query = dbContext.LedgerEntries
            .Where(e => e.OrgId == request.OrgId
                     && e.FyYear == request.FyYear
                     && e.Status == Domain.Entities.PostingStatus.Approved
                     && e.DeletedAt == null
                     && (e.DebitAccountId == request.AccountId || e.CreditAccountId == request.AccountId));

        if (request.PeriodMonth.HasValue)
            query = query.Where(e => e.PeriodMonth == request.PeriodMonth.Value);

        var raw = await query.OrderBy(e => e.PostedAt).ToListAsync(cancellationToken);

        decimal running = 0;
        var lines = raw.Select(e =>
        {
            var isDebit = e.DebitAccountId == request.AccountId;
            var debit = isDebit ? e.Amount : 0;
            var credit = isDebit ? 0 : e.Amount;
            running += debit - credit;
            return new LedgerEntryLine(e.Id, e.PostedAt, e.Narration, debit, credit, running, e.Source.ToString(), e.Status.ToString());
        }).ToList();

        return new LedgerByAccountDto(account.Id, account.AccountCode, account.AccountName, lines, 0, running);
    }
}
