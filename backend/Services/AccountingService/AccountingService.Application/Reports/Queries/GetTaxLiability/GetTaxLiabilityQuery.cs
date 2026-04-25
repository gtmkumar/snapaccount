using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Reports.Queries.GetTaxLiability;

/// <summary>
/// Returns the net GST tax liability (output tax – input tax credit) for an org/FY.
/// Reads from approved ledger entries linked to GST-type accounts.
/// </summary>
public record GetTaxLiabilityQuery(Guid OrgId, int FyYear, int? PeriodMonth = null) : IQuery<TaxLiabilityDto>;

/// <summary>Tax liability summary DTO.</summary>
public record TaxLiabilityDto(
    Guid OrgId,
    int FyYear,
    int? PeriodMonth,
    decimal OutputIgst,
    decimal OutputCgst,
    decimal OutputSgst,
    decimal InputIgst,
    decimal InputCgst,
    decimal InputSgst,
    decimal NetIgst,
    decimal NetCgst,
    decimal NetSgst,
    decimal TotalNetTaxLiability);

/// <summary>Validates the tax liability query.</summary>
public sealed class GetTaxLiabilityQueryValidator : AbstractValidator<GetTaxLiabilityQuery>
{
    public GetTaxLiabilityQueryValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FyYear).InclusiveBetween(2020, 2100);
    }
}

/// <summary>
/// Handles <see cref="GetTaxLiabilityQuery"/>.
/// Identifies GST liability and ITC accounts by account code prefix convention
/// (Indian standard COA: 2300-2399 = GST output liability; 1300-1399 = GST ITC asset).
/// </summary>
public sealed class GetTaxLiabilityQueryHandler(IAccountingDbContext dbContext)
    : IQueryHandler<GetTaxLiabilityQuery, TaxLiabilityDto>
{
    /// <inheritdoc />
    public async Task<Result<TaxLiabilityDto>> Handle(
        GetTaxLiabilityQuery request,
        CancellationToken cancellationToken)
    {
        // GST output liability accounts: codes starting with 2300 (IGST), 2310 (CGST), 2320 (SGST)
        var outputAccounts = await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId && a.DeletedAt == null
                     && (a.AccountCode.StartsWith("2300") || a.AccountCode.StartsWith("2310") || a.AccountCode.StartsWith("2320")))
            .Select(a => new { a.Id, a.AccountCode })
            .ToListAsync(cancellationToken);

        // GST ITC asset accounts: codes starting with 1300 (IGST ITC), 1310 (CGST ITC), 1320 (SGST ITC)
        var inputAccounts = await dbContext.ChartOfAccounts
            .Where(a => a.OrgId == request.OrgId && a.DeletedAt == null
                     && (a.AccountCode.StartsWith("1300") || a.AccountCode.StartsWith("1310") || a.AccountCode.StartsWith("1320")))
            .Select(a => new { a.Id, a.AccountCode })
            .ToListAsync(cancellationToken);

        var allIds = outputAccounts.Select(a => a.Id).Union(inputAccounts.Select(a => a.Id)).ToList();

        var entryQuery = dbContext.LedgerEntries
            .Where(e => e.OrgId == request.OrgId && e.FyYear == request.FyYear
                     && e.Status == Domain.Entities.PostingStatus.Approved && e.DeletedAt == null
                     && (allIds.Contains(e.CreditAccountId) || allIds.Contains(e.DebitAccountId)));

        if (request.PeriodMonth.HasValue)
            entryQuery = entryQuery.Where(e => e.PeriodMonth == request.PeriodMonth.Value);

        var entries = await entryQuery.ToListAsync(cancellationToken);

        static decimal SumCredit(IEnumerable<Domain.Entities.LedgerEntry> entries, IEnumerable<Guid> ids)
        {
            var set = ids.ToHashSet();
            return entries.Where(e => set.Contains(e.CreditAccountId)).Sum(e => e.Amount);
        }

        static decimal SumDebit(IEnumerable<Domain.Entities.LedgerEntry> entries, IEnumerable<Guid> ids)
        {
            var set = ids.ToHashSet();
            return entries.Where(e => set.Contains(e.DebitAccountId)).Sum(e => e.Amount);
        }

        var igstOutput = outputAccounts.Where(a => a.AccountCode.StartsWith("2300")).Select(a => a.Id);
        var cgstOutput = outputAccounts.Where(a => a.AccountCode.StartsWith("2310")).Select(a => a.Id);
        var sgstOutput = outputAccounts.Where(a => a.AccountCode.StartsWith("2320")).Select(a => a.Id);
        var igstInput = inputAccounts.Where(a => a.AccountCode.StartsWith("1300")).Select(a => a.Id);
        var cgstInput = inputAccounts.Where(a => a.AccountCode.StartsWith("1310")).Select(a => a.Id);
        var sgstInput = inputAccounts.Where(a => a.AccountCode.StartsWith("1320")).Select(a => a.Id);

        var outIgst = SumCredit(entries, igstOutput);
        var outCgst = SumCredit(entries, cgstOutput);
        var outSgst = SumCredit(entries, sgstOutput);
        var inIgst = SumDebit(entries, igstInput);
        var inCgst = SumDebit(entries, cgstInput);
        var inSgst = SumDebit(entries, sgstInput);

        return new TaxLiabilityDto(
            request.OrgId, request.FyYear, request.PeriodMonth,
            outIgst, outCgst, outSgst,
            inIgst, inCgst, inSgst,
            outIgst - inIgst, outCgst - inCgst, outSgst - inSgst,
            (outIgst - inIgst) + (outCgst - inCgst) + (outSgst - inSgst));
    }
}
