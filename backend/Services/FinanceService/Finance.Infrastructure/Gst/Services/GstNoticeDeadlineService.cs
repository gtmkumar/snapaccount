using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GstService.Infrastructure.Services;

/// <summary>
/// Computes statutory response deadlines for GST notices from the config-driven
/// <c>gst.notice_deadline_rules</c> table.
/// GAP-108: implements <see cref="IGstNoticeDeadlineService"/>.
///
/// Fallback chain:
///  1. FY-specific active rule for the form type.
///  2. "ALL" sentinel active rule for the form type.
///  3. Hardcoded conservative defaults (logs warning).
///
/// Hardcoded defaults exist ONLY as a final safety net — the migration seeds all
/// mandatory rows so the DB path should always win in practice.
/// </summary>
public sealed class GstNoticeDeadlineService(IGstDbContext dbContext) : IGstNoticeDeadlineService
{
    // Conservative fallback window per form type — used only when DB has no matching rule.
    private static readonly IReadOnlyDictionary<GstNoticeFormType, int> FallbackWindowDays =
        new Dictionary<GstNoticeFormType, int>
        {
            [GstNoticeFormType.ASMT_10] = 30,
            [GstNoticeFormType.DRC_01]  = 30,
            [GstNoticeFormType.DRC_01A] = 30,
            [GstNoticeFormType.DRC_01B] = 7,
            [GstNoticeFormType.DRC_01C] = 7,
            [GstNoticeFormType.ADT_01]  = 30,
            [GstNoticeFormType.OTHER]   = 30,
        };

    /// <inheritdoc />
    public async Task<int> GetResponseWindowDaysAsync(
        GstNoticeFormType formType,
        string financialYear,
        CancellationToken cancellationToken = default)
    {
        // Try FY-specific rule first
        var rule = await dbContext.GstNoticeDeadlineRules
            .Where(r => r.FormType == formType
                     && r.IsActive
                     && (r.FinancialYear == financialYear || r.FinancialYear == "ALL")
                     && r.DeletedAt == null)
            .OrderByDescending(r => r.FinancialYear) // FY-specific wins over "ALL"
            .FirstOrDefaultAsync(cancellationToken);

        if (rule is not null)
            return rule.ResponseWindowDays;

        // Fallback with warning
        System.Console.Error.WriteLine(
            $"[WARN] GstNoticeDeadlineService: No DB rule for {formType}/{financialYear} — " +
            $"using hardcoded fallback. Seed migration 084 data if this persists.");

        return FallbackWindowDays.TryGetValue(formType, out var days) ? days : 30;
    }

    /// <inheritdoc />
    public async Task<DateOnly> ComputeDeadlineAsync(
        GstNoticeFormType formType,
        DateOnly noticeDate,
        string financialYear,
        CancellationToken cancellationToken = default)
    {
        var windowDays = await GetResponseWindowDaysAsync(formType, financialYear, cancellationToken);
        return noticeDate.AddDays(windowDays);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<GstNoticeDeadlineRule>> GetActiveRulesAsync(
        string? financialYear = null,
        CancellationToken cancellationToken = default)
    {
        var query = dbContext.GstNoticeDeadlineRules
            .Where(r => r.IsActive && r.DeletedAt == null);

        if (financialYear is not null)
            query = query.Where(r => r.FinancialYear == financialYear || r.FinancialYear == "ALL");

        return await query
            .OrderBy(r => r.FinancialYear)
            .ThenBy(r => r.FormType)
            .ToListAsync(cancellationToken);
    }
}
