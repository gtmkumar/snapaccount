using GstService.Domain.Entities;
using GstService.Domain.Enums;

namespace GstService.Application.Interfaces;

/// <summary>
/// Computes statutory response deadlines for GST notices from config-driven rules.
/// GAP-108: Injected into command handlers to stamp <see cref="GstNotice.StatutoryDeadline"/>
/// at notice creation and form-type classification time.
/// </summary>
public interface IGstNoticeDeadlineService
{
    /// <summary>
    /// Returns the statutory response window (days) for a given form type and financial year.
    /// Falls back to "ALL" sentinel rule when no FY-specific row exists.
    /// </summary>
    Task<int> GetResponseWindowDaysAsync(
        GstNoticeFormType formType,
        string financialYear,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Computes the statutory deadline date = noticeDate + window days.
    /// </summary>
    Task<DateOnly> ComputeDeadlineAsync(
        GstNoticeFormType formType,
        DateOnly noticeDate,
        string financialYear,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns all active deadline rules, optionally filtered by financial year.
    /// </summary>
    Task<IReadOnlyList<GstNoticeDeadlineRule>> GetActiveRulesAsync(
        string? financialYear = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Derives the GST financial year string (e.g. "2025-26") from a calendar date.
    /// Indian FY runs April–March.
    /// </summary>
    static string GetFinancialYear(DateOnly date)
    {
        // April–March FY: if month >= 4, FY starts this year; else starts previous year.
        var startYear = date.Month >= 4 ? date.Year : date.Year - 1;
        return $"{startYear}-{(startYear + 1) % 100:D2}";
    }
}
