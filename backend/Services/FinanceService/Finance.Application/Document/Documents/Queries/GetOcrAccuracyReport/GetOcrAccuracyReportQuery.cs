using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Queries.GetOcrAccuracyReport;

/// <summary>
/// GAP-014: Returns an OCR accuracy report aggregated by field name and issue type
/// for the specified date window (default: last 30 days).
/// Intended for the admin document analytics panel to track accuracy trends.
/// </summary>
[RequiresPermission("document.admin")]
public record GetOcrAccuracyReportQuery(
    DateOnly? FromDate,
    DateOnly? ToDate) : IQuery<OcrAccuracyReportDto>;

/// <summary>Aggregated OCR accuracy report.</summary>
public record OcrAccuracyReportDto(
    DateOnly FromDate,
    DateOnly ToDate,
    int TotalFeedbackCount,
    IReadOnlyList<FieldAccuracyStat> ByField);

/// <summary>Per-field accuracy stats.</summary>
public record FieldAccuracyStat(
    string FieldName,
    int FeedbackCount,
    IReadOnlyList<IssueTypeStat> ByIssueType);

/// <summary>Per-issue-type count within a field.</summary>
public record IssueTypeStat(string IssueType, int Count);

/// <summary>Validates the GetOcrAccuracyReportQuery.</summary>
public sealed class GetOcrAccuracyReportQueryValidator : AbstractValidator<GetOcrAccuracyReportQuery>
{
    /// <summary>Initialises validation rules.</summary>
    public GetOcrAccuracyReportQueryValidator()
    {
        // If both dates are provided, ToDate must be >= FromDate
        RuleFor(x => x)
            .Must(q => q.FromDate is null || q.ToDate is null || q.ToDate >= q.FromDate)
            .WithMessage("ToDate must be on or after FromDate.");
    }
}

/// <summary>Handles <see cref="GetOcrAccuracyReportQuery"/>.</summary>
public sealed class GetOcrAccuracyReportQueryHandler(IDocumentDbContext db)
    : IQueryHandler<GetOcrAccuracyReportQuery, OcrAccuracyReportDto>
{
    /// <inheritdoc />
    public async Task<Result<OcrAccuracyReportDto>> Handle(
        GetOcrAccuracyReportQuery request,
        CancellationToken cancellationToken)
    {
        var to = request.ToDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var from = request.FromDate ?? to.AddDays(-30);
        var fromUtc = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var toUtc = to.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        // Join OcrFeedback → OcrField to get the field name
        var feedbacks = await (
            from fb in db.OcrFeedbacks
            join field in db.OcrFields on fb.OcrFieldId equals field.Id
            where fb.CreatedAt >= fromUtc
                && fb.CreatedAt <= toUtc
                && fb.DeletedAt == null
                && field.DeletedAt == null
            select new { fb.IssueType, field.FieldName }
        ).ToListAsync(cancellationToken);

        var byField = feedbacks
            .GroupBy(f => f.FieldName)
            .Select(g => new FieldAccuracyStat(
                FieldName: g.Key,
                FeedbackCount: g.Count(),
                ByIssueType: g
                    .GroupBy(x => x.IssueType)
                    .Select(gg => new IssueTypeStat(gg.Key, gg.Count()))
                    .OrderByDescending(s => s.Count)
                    .ToList()))
            .OrderByDescending(f => f.FeedbackCount)
            .ToList();

        var report = new OcrAccuracyReportDto(
            FromDate: from,
            ToDate: to,
            TotalFeedbackCount: feedbacks.Count,
            ByField: byField);

        return Result<OcrAccuracyReportDto>.Success(report);
    }
}
