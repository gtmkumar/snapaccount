namespace GstService.Domain.Enums;

/// <summary>
/// GSTAT appeal tracking stage for a GST notice.
/// GAP-108: Added in migration 084.
///
/// NONE              — No appeal filed (default).
/// REPLY_FILED       — Taxpayer has filed a reply to the notice.
/// ORDER_RECEIVED    — Adjudicating authority has passed an order.
/// APPEAL_FILED      — Taxpayer has filed an appeal before the Appellate Authority.
/// GSTAT_PENDING     — Matter is before the GST Appellate Tribunal (GSTAT).
/// RESOLVED          — Appeal or dispute fully resolved / order complied.
/// </summary>
public enum GstNoticeAppealStage
{
    /// <summary>No appeal filed. Default state.</summary>
    NONE,

    /// <summary>Taxpayer reply filed; awaiting adjudicating authority order.</summary>
    REPLY_FILED,

    /// <summary>Adjudicating authority order received; appeal window open.</summary>
    ORDER_RECEIVED,

    /// <summary>Appeal filed before the Appellate Authority (First Appeal).</summary>
    APPEAL_FILED,

    /// <summary>Matter pending before GSTAT (Second Appeal).</summary>
    GSTAT_PENDING,

    /// <summary>All proceedings concluded / fully resolved.</summary>
    RESOLVED
}
