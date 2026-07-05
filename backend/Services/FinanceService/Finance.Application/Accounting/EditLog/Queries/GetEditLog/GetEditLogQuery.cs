using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.EditLog.Queries.GetEditLog;

// ── Permission ──────────────────────────────────────────────────────────────
// Permission name: accounting.editlog.read
// NOTE FOR PERMISSION SEEDING (auth.permissions table):
//   INSERT INTO auth.permissions (code, description)
//   VALUES ('accounting.editlog.read',
//           'View the MCA statutory edit log for books of account (GAP-100).')
//   ON CONFLICT (code) DO NOTHING;
// ────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Returns a paginated slice of the MCA statutory edit log for the caller's organisation.
/// Access is org-scoped via <see cref="ICurrentUser.OrganizationId"/>.
/// </summary>
[RequiresPermission("accounting.editlog.read")]
public record GetEditLogQuery(
    string? FyYear,
    string? EntityType,
    int Page,
    int PageSize) : IQuery<EditLogPageDto>;

/// <summary>Paginated edit-log response.</summary>
public record EditLogPageDto(
    int Page,
    int PageSize,
    int TotalCount,
    IReadOnlyList<EditLogEntryDto> Items);

/// <summary>Single edit-log entry for the API response.</summary>
public record EditLogEntryDto(
    Guid Id,
    string EntityType,
    Guid EntityId,
    string Operation,
    Guid? ChangedBy,
    DateTime ChangedAt,
    string? FyYear,
    string? ChangeReason,
    string? RequestId,
    string? BeforeState,
    string? AfterState,
    DateOnly? RetentionUntil);

/// <summary>FluentValidation for <see cref="GetEditLogQuery"/>.</summary>
public sealed class GetEditLogQueryValidator : AbstractValidator<GetEditLogQuery>
{
    private static readonly HashSet<string> ValidEntityTypes =
    [
        "journal_entry", "journal_entry_line", "ledger_entry", "account", "ledger"
    ];

    public GetEditLogQueryValidator()
    {
        RuleFor(x => x.FyYear)
            .Matches(@"^\d{4}-\d{2}$")
            .When(x => x.FyYear != null)
            .WithMessage("fyYear must be in 'YYYY-YY' format, e.g. '2026-27'.");

        RuleFor(x => x.EntityType)
            .Must(t => t == null || ValidEntityTypes.Contains(t))
            .WithMessage($"entityType must be one of: {string.Join(", ", ValidEntityTypes)}.");

        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

/// <summary>Handler: queries <c>accounting.edit_log</c> with org isolation.</summary>
public sealed class GetEditLogQueryHandler(
    IAccountingDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetEditLogQuery, EditLogPageDto>
{
    /// <inheritdoc />
    public async Task<Result<EditLogPageDto>> Handle(
        GetEditLogQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Error.Validation("EditLog.NoOrg", "User is not associated with an organisation.");

        var orgId = currentUser.OrganizationId.Value;

        var q = db.EditLogs.AsNoTracking()
            .Where(e => e.OrgId == orgId);

        if (!string.IsNullOrWhiteSpace(request.FyYear))
            q = q.Where(e => e.FyYear == request.FyYear);

        if (!string.IsNullOrWhiteSpace(request.EntityType))
            q = q.Where(e => e.EntityType == request.EntityType);

        q = q.OrderByDescending(e => e.ChangedAt);

        var totalCount = await q.CountAsync(cancellationToken);

        var items = await q
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(e => new EditLogEntryDto(
                e.Id,
                e.EntityType,
                e.EntityId,
                e.Operation,
                e.ChangedBy,
                e.ChangedAt,
                e.FyYear,
                e.ChangeReason,
                e.RequestId,
                e.BeforeState,
                e.AfterState,
                e.RetentionUntil))
            .ToListAsync(cancellationToken);

        return new EditLogPageDto(request.Page, request.PageSize, totalCount, items);
    }
}
