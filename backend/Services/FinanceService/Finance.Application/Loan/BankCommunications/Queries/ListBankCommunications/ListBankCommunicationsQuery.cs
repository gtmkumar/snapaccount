using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.BankCommunications.Queries.ListBankCommunications;

/// <summary>
/// Returns org-wide bank communication log entries.
/// Admin / DG-LOAN-01: GET /loans/bank-communications
/// Matches admin BankCommMessagesListSchema { items, totalCount }.
///
/// NOTE: "Bank communications" for SnapAccount are represented by the ApplicationStatusLog
/// (every partner-bank interaction is recorded as a status transition), augmented with
/// per-application log entries.  We return status-log entries joined to their bank (AssignedBank)
/// to populate direction/channel/status from the adapter type.
/// </summary>
[RequiresPermission("loan.bank.decision")]
public record ListBankCommunicationsQuery(
    Guid? ApplicationId = null,
    string? BankId = null,
    string? Direction = null,
    string? Channel = null,
    string? Status = null,
    DateTime? From = null,
    DateTime? To = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListBankCommunicationsResponse>;

/// <summary>Paginated response matching admin BankCommMessagesListSchema.</summary>
public record ListBankCommunicationsResponse(
    IReadOnlyList<BankCommMessageDto> Items,
    int TotalCount);

/// <summary>
/// Bank communication message DTO matching admin BankCommMessageSchema.
/// Fields mapped from ApplicationStatusLog + LoanApplication + PartnerBank.
/// </summary>
public record BankCommMessageDto(
    Guid MessageId,
    Guid? ApplicationId,
    Guid BankId,
    string? BankName,
    string? BankLogoUrl,
    string AdapterType,
    string Direction,
    string Channel,
    string? Subject,
    string? Endpoint,
    string Status,
    DateTime Timestamp,
    int? ResponseStatus,
    string? PayloadMasked,
    string? ResponseMasked);

/// <summary>Handler: returns org-wide bank communication log with pagination.</summary>
public sealed class ListBankCommunicationsQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListBankCommunicationsQuery, ListBankCommunicationsResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListBankCommunicationsResponse>> Handle(
        ListBankCommunicationsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Query applications in this org that have an assigned bank
        var query = from log in db.ApplicationStatusLogs
                    join app in db.LoanApplications
                        on log.ApplicationId equals app.Id
                    join bank in db.PartnerBanks
                        on app.AssignedBankId equals bank.Id
                    where app.OrgId == orgId && app.DeletedAt == null
                    select new { log, app, bank };

        // Optional filters
        if (request.ApplicationId.HasValue)
            query = query.Where(x => x.app.Id == request.ApplicationId.Value);

        if (!string.IsNullOrWhiteSpace(request.BankId) && Guid.TryParse(request.BankId, out var bankGuid))
            query = query.Where(x => x.bank.Id == bankGuid);

        if (request.From.HasValue)
            query = query.Where(x => x.log.TransitionedAt >= request.From.Value);

        if (request.To.HasValue)
            query = query.Where(x => x.log.TransitionedAt <= request.To.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
            query = query.Where(x =>
                x.bank.Name.Contains(request.Search) ||
                (x.log.Notes != null && x.log.Notes.Contains(request.Search)));

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(x => x.log.TransitionedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new BankCommMessageDto(
                x.log.Id,
                x.app.Id,
                x.bank.Id,
                x.bank.Name,
                x.bank.LogoUrl,
                x.bank.AdapterType.ToString().ToUpperInvariant(),
                "outbound",                    // All admin-recorded status changes are outbound
                MapChannel(x.bank.AdapterType),
                $"{x.log.FromStatus} → {x.log.ToStatus}",
                null,                          // Endpoint: not stored in status log
                MapCommStatus(x.log.TransitionSource),
                x.log.TransitionedAt,
                null,                          // ResponseStatus: not stored
                x.log.Notes,                   // PayloadMasked = notes (safe — no secrets)
                null))                         // ResponseMasked: not stored
            .ToListAsync(cancellationToken);

        return new ListBankCommunicationsResponse(items, total);
    }

    /// <summary>Maps BankAdapterType to channel string for admin schema.</summary>
    private static string MapChannel(BankAdapterType adapterType) => adapterType switch
    {
        BankAdapterType.Email => "email",
        BankAdapterType.Rest => "rest",
        BankAdapterType.OAuth => "oauth",
        _ => "email"
    };

    /// <summary>Maps TransitionSource to BankCommStatus for admin schema.</summary>
    private static string MapCommStatus(string source) => source switch
    {
        "Webhook" => "DELIVERED",
        "System" => "SENT",
        "User" => "DELIVERED",
        _ => "SENT"
    };
}
