using AccountingService.Application.FiscalYear.Commands.CloseFiscalYear;
using AccountingService.Application.JournalBatches.Commands.PostJournalBatch;
using AccountingService.Application.JournalBatches.Commands.ReviewPosting;
using AccountingService.Application.JournalBatches.Commands.ReversePosting;
using AccountingService.Application.Organizations.Commands.BootstrapCoa;
using AccountingService.Application.Reports.Queries.GetBalanceSheet;
using AccountingService.Application.Reports.Queries.GetLedgerByAccount;
using AccountingService.Application.Reports.Queries.GetProfitAndLoss;
using AccountingService.Application.Reports.Queries.GetTaxLiability;
using AccountingService.Application.Reports.Queries.GetTrialBalance;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Api.Endpoints;

/// <summary>
/// All /accounting endpoints — journal entries, ledger, trial balance, financial reports,
/// fiscal year close, and org COA bootstrap.
/// Phase 6A: all endpoints are fully implemented — zero 501 responses, zero TODO markers.
/// Inherits <see cref="EndpointGroupBase"/>; discovered automatically by
/// <see cref="WebApplicationExtensions.MapEndpoints"/>.
/// </summary>
public sealed class Accounting : EndpointGroupBase
{
    /// <summary>Route prefix: /accounting.</summary>
    public override string? GroupName => "/accounting";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // POST /accounting/journal-entries — post a manual journal batch
        groupBuilder.MapPost("/journal-entries", PostJournalBatch)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // GET /accounting/trial-balance?fyYear={year}
        groupBuilder.MapGet("/trial-balance", GetTrialBalance)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // GET /accounting/reports/{type}?fyYear={year}&periodMonth={m}&accountId={id}
        groupBuilder.MapGet("/reports/{type}", GetReport)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/fiscal-year/close
        groupBuilder.MapPost("/fiscal-year/close", CloseFiscalYear)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/organizations/{id}/bootstrap-coa
        groupBuilder.MapPost("/organizations/{id:guid}/bootstrap-coa", BootstrapCoa)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/postings/{id}/review
        groupBuilder.MapPost("/postings/{id:guid}/review", ReviewPosting)
            .RequireAuthorization()
            .RequireRateLimiting("standard");

        // POST /accounting/postings/{id}/reverse
        groupBuilder.MapPost("/postings/{id:guid}/reverse", ReversePosting)
            .RequireAuthorization()
            .RequireRateLimiting("standard");
    }

    private static async Task<IResult> PostJournalBatch(
        PostJournalBatchRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var orgId = currentUser.OrganizationId.Value;
        var command = new PostJournalBatchCommand(
            orgId,
            req.Description,
            req.PostingDate,
            req.Entries.Select(e => new JournalBatchLineRequest(
                e.DebitAccountId, e.CreditAccountId, e.Amount, e.Narration)).ToList());

        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.Created($"/accounting/journal-batches/{result.Value.BatchId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> GetTrialBalance(
        ISender sender,
        ICurrentUser currentUser,
        int fyYear = 2026)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var result = await sender.Send(new GetTrialBalanceQuery(currentUser.OrganizationId.Value, fyYear));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetReport(
        string type,
        ISender sender,
        ICurrentUser currentUser,
        int fyYear = 2026,
        int? periodMonth = null,
        Guid? accountId = null)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var orgId = currentUser.OrganizationId.Value;

        return type.ToLowerInvariant() switch
        {
            "trial-balance" => await HandleQuery(sender.Send(new GetTrialBalanceQuery(orgId, fyYear))),
            "profit-and-loss" => await HandleQuery(sender.Send(new GetProfitAndLossQuery(orgId, fyYear, periodMonth))),
            "balance-sheet" => await HandleQuery(sender.Send(new GetBalanceSheetQuery(orgId, fyYear))),
            "tax-liability" => await HandleQuery(sender.Send(new GetTaxLiabilityQuery(orgId, fyYear, periodMonth))),
            "ledger" when accountId.HasValue => await HandleQuery(sender.Send(new GetLedgerByAccountQuery(orgId, accountId.Value, fyYear, periodMonth))),
            "ledger" => Results.BadRequest(new { error = "accountId query parameter required for ledger report." }),
            _ => Results.BadRequest(new { error = $"Unknown report type '{type}'." })
        };
    }

    private static async Task<IResult> CloseFiscalYear(
        CloseFiscalYearRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        if (currentUser.OrganizationId is null)
            return Results.BadRequest(new { error = "No organisation associated with this user." });

        var command = new CloseFiscalYearCommand(currentUser.OrganizationId.Value, req.FyYear, currentUser.UserId, req.Notes);
        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> BootstrapCoa(Guid id, ISender sender)
    {
        var result = await sender.Send(new BootstrapOrganizationChartOfAccountsCommand(id));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> ReviewPosting(
        Guid id,
        ReviewPostingRequest req,
        ISender sender,
        ICurrentUser currentUser)
    {
        var command = new ReviewPostingCommand(id, req.Approve, currentUser.UserId);
        var result = await sender.Send(command);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> ReversePosting(Guid id, ISender sender, ICurrentUser currentUser)
    {
        var result = await sender.Send(new ReversePostingCommand(id, currentUser.UserId));
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> HandleQuery<T>(Task<Result<T>> queryTask)
    {
        var result = await queryTask;
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type == ErrorType.NotFound
                ? Results.NotFound(new { error = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Message });
    }
}

// Request DTOs
internal record PostJournalBatchRequest(
    string Description,
    DateOnly PostingDate,
    IReadOnlyList<JournalLineRequest> Entries);

internal record JournalLineRequest(
    Guid DebitAccountId,
    Guid CreditAccountId,
    decimal Amount,
    string Narration);

internal record CloseFiscalYearRequest(int FyYear, string? Notes = null);
internal record ReviewPostingRequest(bool Approve);
