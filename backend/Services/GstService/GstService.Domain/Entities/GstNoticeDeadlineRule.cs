using GstService.Domain.Enums;
using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Config-driven statutory response deadline rules for GST notice form types.
/// GAP-108: Stored in <c>gst.notice_deadline_rules</c> (migration 084).
///
/// Rules are versioned by financial year so that regulatory changes (Notifications /
/// Circulars amending response windows) are captured without code changes.
///
/// House compliance rule: ALL tax/compliance timelines must be configuration-driven
/// with FY versioning — never hardcoded.
///
/// Seeded rows on migration 084 for FY 2025-26 per CGST Act:
///   ASMT_10  → 30 days (Rule 99)
///   DRC_01   → 30 days (Rule 142)
///   DRC_01A  → 30 days (Rule 142(1a))
///   DRC_01B  →  7 days (Rule 88C)
///   DRC_01C  →  7 days (Rule 88D)
///   ADT_01   → 30 days (Section 65)
///   OTHER    → 30 days (conservative default)
/// </summary>
public class GstNoticeDeadlineRule : BaseAuditableEntity
{
    /// <summary>
    /// Financial year this rule applies to — format "yyyy-yy" (e.g. "2025-26").
    /// "ALL" is a sentinel that matches any FY when no FY-specific row exists.
    /// </summary>
    public string FinancialYear { get; private set; } = string.Empty;

    /// <summary>The notice form type this rule governs.</summary>
    public GstNoticeFormType FormType { get; private set; }

    /// <summary>
    /// Number of calendar days from the notice date within which the taxpayer
    /// must respond (default statutory window per CGST Act).
    /// </summary>
    public int ResponseWindowDays { get; private set; }

    /// <summary>
    /// Optional override: some notices explicitly specify a deadline date in the notice text.
    /// When true, the operator must set DueDate via OverrideDeadline() and the statutory
    /// computation serves only as a fallback floor.
    /// </summary>
    public bool AllowsNoticeTextOverride { get; private set; } = true;

    /// <summary>
    /// Human-readable citation for the legal basis of this rule
    /// (e.g. "Rule 88C CGST Rules 2017 — Notification 38/2023 dt. 04-Aug-2023").
    /// </summary>
    public string? LegalBasis { get; private set; }

    /// <summary>Whether this rule is currently active (soft-disable without deletion).</summary>
    public bool IsActive { get; private set; } = true;

    private GstNoticeDeadlineRule() { }

    /// <summary>Creates a new deadline rule row.</summary>
    public static GstNoticeDeadlineRule Create(
        string financialYear,
        GstNoticeFormType formType,
        int responseWindowDays,
        string? legalBasis = null,
        bool allowsNoticeTextOverride = true)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(responseWindowDays);
        return new GstNoticeDeadlineRule
        {
            FinancialYear = financialYear,
            FormType = formType,
            ResponseWindowDays = responseWindowDays,
            LegalBasis = legalBasis,
            AllowsNoticeTextOverride = allowsNoticeTextOverride
        };
    }

    /// <summary>Deactivates this rule (superseded by a new FY rule).</summary>
    public void Deactivate() => IsActive = false;

    /// <summary>Updates the response window (e.g. when a CGST Notification amends the timeline).</summary>
    public void UpdateResponseWindow(int newWindowDays, string? updatedLegalBasis = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(newWindowDays);
        ResponseWindowDays = newWindowDays;
        if (updatedLegalBasis is not null)
            LegalBasis = updatedLegalBasis;
    }
}
