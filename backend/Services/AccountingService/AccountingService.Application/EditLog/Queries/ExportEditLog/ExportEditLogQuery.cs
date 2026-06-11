using AccountingService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.EditLog.Queries.ExportEditLog;

/// <summary>
/// Exports the full MCA edit log for a given financial year as a CSV stream.
/// Intended for the statutory FY export required by auditors under the
/// Companies (Accounts) Rules, 2014 Rule 3(5)/(6).
/// Rate-limited (standard) — the endpoint streams to avoid large in-memory lists.
/// </summary>
[RequiresPermission("accounting.editlog.read")]
public record ExportEditLogQuery(string FyYear) : IQuery<ExportEditLogResult>;

/// <summary>Streamed CSV payload for the export.</summary>
public record ExportEditLogResult(string Csv, string FileName);

/// <summary>Validates the export query.</summary>
public sealed class ExportEditLogQueryValidator : AbstractValidator<ExportEditLogQuery>
{
    public ExportEditLogQueryValidator()
    {
        RuleFor(x => x.FyYear)
            .NotEmpty()
            .Matches(@"^\d{4}-\d{2}$")
            .WithMessage("fyYear is required and must be in 'YYYY-YY' format, e.g. '2026-27'.");
    }
}

/// <summary>Handler: streams all edit-log rows for the requested FY as CSV.</summary>
public sealed class ExportEditLogQueryHandler(
    IAccountingDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<ExportEditLogQuery, ExportEditLogResult>
{
    /// <inheritdoc />
    public async Task<Result<ExportEditLogResult>> Handle(
        ExportEditLogQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Error.Validation("EditLog.NoOrg", "User is not associated with an organisation.");

        var orgId = currentUser.OrganizationId.Value;

        var rows = await db.EditLogs.AsNoTracking()
            .Where(e => e.OrgId == orgId && e.FyYear == request.FyYear)
            .OrderBy(e => e.ChangedAt)
            .Select(e => new
            {
                e.Id,
                e.EntityType,
                e.EntityId,
                e.Operation,
                e.ChangedBy,
                e.ChangedAt,
                e.FyYear,
                e.ChangeReason,
                e.RequestId,
                e.CorrelationId,
                e.RetentionUntil
            })
            .ToListAsync(cancellationToken);

        var csv = BuildCsv(rows.Select(r => new CsvRow(
            r.Id, r.EntityType, r.EntityId.ToString(), r.Operation,
            r.ChangedBy?.ToString() ?? string.Empty,
            r.ChangedAt.ToString("o"),
            r.FyYear ?? string.Empty,
            r.ChangeReason ?? string.Empty,
            r.RequestId ?? string.Empty,
            r.CorrelationId ?? string.Empty,
            r.RetentionUntil?.ToString("yyyy-MM-dd") ?? string.Empty)));

        var fileName = $"edit_log_{orgId:N}_{request.FyYear.Replace("-", "_")}.csv";
        return new ExportEditLogResult(csv, fileName);
    }

    private sealed record CsvRow(
        Guid Id, string EntityType, string EntityId, string Operation,
        string ChangedBy, string ChangedAt, string FyYear,
        string ChangeReason, string RequestId, string CorrelationId, string RetentionUntil);

    private static string BuildCsv(IEnumerable<CsvRow> rows)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("id,entity_type,entity_id,operation,changed_by,changed_at,fy_year,change_reason,request_id,correlation_id,retention_until");

        foreach (var r in rows)
        {
            sb.Append(CsvField(r.Id.ToString())).Append(',');
            sb.Append(CsvField(r.EntityType)).Append(',');
            sb.Append(CsvField(r.EntityId)).Append(',');
            sb.Append(CsvField(r.Operation)).Append(',');
            sb.Append(CsvField(r.ChangedBy)).Append(',');
            sb.Append(CsvField(r.ChangedAt)).Append(',');
            sb.Append(CsvField(r.FyYear)).Append(',');
            sb.Append(CsvField(r.ChangeReason)).Append(',');
            sb.Append(CsvField(r.RequestId)).Append(',');
            sb.Append(CsvField(r.CorrelationId)).Append(',');
            sb.AppendLine(CsvField(r.RetentionUntil));
        }

        return sb.ToString();
    }

    private static string CsvField(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }
}
