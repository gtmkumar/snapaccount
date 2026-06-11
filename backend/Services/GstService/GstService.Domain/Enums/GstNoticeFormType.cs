namespace GstService.Domain.Enums;

/// <summary>
/// Canonical form-type taxonomy for GST notices as per CGST Act.
/// GAP-108: mandatory from 2026-06-12 — all new notices must carry a form_type.
/// Existing rows backfilled to <see cref="OTHER"/> on migration 084.
///
/// ASMT-10  — Assessment scrutiny notice (Rule 99 CGST Rules)
/// DRC-01   — Summary of demand and recovery (Rule 142)
/// DRC-01A  — Intimation of tax ascertained payable pre-SCN (Rule 142(1a))
/// DRC-01B  — Liability mismatch GSTR-1 vs GSTR-3B (Rule 88C)
/// DRC-01C  — ITC mismatch GSTR-3B vs GSTR-2B (Rule 88D)
/// ADT-01   — Audit notice (Section 65 CGST Act)
/// OTHER    — Any other notice type not covered above.
/// </summary>
public enum GstNoticeFormType
{
    /// <summary>ASMT-10 — Scrutiny of returns notice (Rule 99).</summary>
    ASMT_10,

    /// <summary>DRC-01 — Summary demand and recovery notice (Rule 142).</summary>
    DRC_01,

    /// <summary>DRC-01A — Pre-SCN intimation of tax payable (Rule 142(1a)).</summary>
    DRC_01A,

    /// <summary>DRC-01B — GSTR-1 vs GSTR-3B liability mismatch (Rule 88C).</summary>
    DRC_01B,

    /// <summary>DRC-01C — GSTR-3B vs GSTR-2B ITC mismatch (Rule 88D).</summary>
    DRC_01C,

    /// <summary>ADT-01 — GST audit notice (Section 65 CGST Act).</summary>
    ADT_01,

    /// <summary>OTHER — All other notice types; default for pre-migration rows.</summary>
    OTHER
}
