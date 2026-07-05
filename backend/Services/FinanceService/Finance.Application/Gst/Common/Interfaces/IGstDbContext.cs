using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GstService.Application.Common.Interfaces;


/// <summary>
/// Application-layer abstraction over the gst schema database context.
/// Query handlers depend on this interface for direct LINQ projection (Jason Taylor pattern).
/// Write-side command handlers use <c>IGstReturnRepository</c> for aggregate lifecycle management.
/// The concrete <c>GstDbContext</c> in Infrastructure implements this interface.
/// </summary>
public interface IGstDbContext
{
    /// <summary>GST returns (GSTR-1, GSTR-3B, GSTR-9) in <c>gst.gst_returns</c>.</summary>
    DbSet<GstReturn> GstReturns { get; }

    /// <summary>Line items on each GST return in <c>gst.gst_return_line_items</c>.</summary>
    DbSet<GstReturnLineItem> GstReturnLineItems { get; }

    /// <summary>GST invoices (B2B, B2C, export) in <c>gst.gst_invoices</c>.</summary>
    DbSet<GstInvoice> GstInvoices { get; }

    /// <summary>Configurable GST tax rates in <c>gst.gst_tax_rates</c> — never hardcoded.</summary>
    DbSet<GstTaxRate> GstTaxRates { get; }

    /// <summary>HSN/SAC code master in <c>gst.hsn_sac_codes</c>.</summary>
    DbSet<HsnSacCode> HsnSacCodes { get; }

    /// <summary>Input tax credit records in <c>gst.itc_records</c>.</summary>
    DbSet<ItcRecord> ItcRecords { get; }

    /// <summary>ITC mismatch records (2A vs 2B reconciliation) in <c>gst.itc_mismatches</c>.</summary>
    DbSet<ItcMismatch> ItcMismatches { get; }

    /// <summary>GST notices received from the portal in <c>gst.gst_notices</c>.</summary>
    DbSet<GstNotice> GstNotices { get; }

    /// <summary>E-invoices (mandatory for turnover &gt; 5 Cr) in <c>gst.e_invoices</c>.</summary>
    DbSet<EInvoice> EInvoices { get; }

    /// <summary>E-way bills in <c>gst.e_way_bills</c>.</summary>
    DbSet<EWayBill> EWayBills { get; }

    /// <summary>GST reconciliation runs in <c>gst.gst_reconciliations</c>.</summary>
    DbSet<GstReconciliation> GstReconciliations { get; }

    /// <summary>GST refund applications in <c>gst.gst_refunds</c>.</summary>
    DbSet<GstRefund> GstRefunds { get; }

    /// <summary>Annual GST returns (GSTR-9/9C) in <c>gst.gst_annual_returns</c>.</summary>
    DbSet<GstAnnualReturn> GstAnnualReturns { get; }

    /// <summary>LUT filings (Letter of Undertaking for zero-rated exports) in <c>gst.lut_filings</c>.</summary>
    DbSet<LutFiling> LutFilings { get; }

    // ── IMS (Invoice Management System) — mandatory from 1 Apr 2026 ──────────

    /// <summary>
    /// IMS inward invoices (supplier-reported, pending taxpayer action) in <c>gst.ims_invoices</c>.
    /// GAP-101: mandatory for regular filers from 1 Apr 2026.
    /// </summary>
    DbSet<ImsInvoice> ImsInvoices { get; }

    /// <summary>
    /// Append-only action log for IMS invoice state transitions in <c>gst.ims_action_logs</c>.
    /// 7-year retention; never deleted.
    /// </summary>
    DbSet<ImsActionLog> ImsActionLogs { get; }

    /// <summary>
    /// GSTR-1A amendments (only way to correct GSTR-3B Table 3 after filing) in <c>gst.gstr1a_amendments</c>.
    /// GAP-101: required because GSTR-3B Table 3 is hard-locked post-1-Apr-2026.
    /// </summary>
    DbSet<Gstr1aAmendment> Gstr1aAmendments { get; }

    // ── GAP-108: Notice deadline rules (config-driven, FY-versioned) ──────────

    /// <summary>
    /// Config-driven statutory deadline rules per form type and financial year.
    /// GAP-108: migration 084. Never hardcode response windows — read from this table.
    /// </summary>
    DbSet<GstNoticeDeadlineRule> GstNoticeDeadlineRules { get; }

    // ── DG-GST-02: ARN capture + audit trail ─────────────────────────────────

    /// <summary>
    /// Append-only audit log for GST return state transitions and ARN edits.
    /// Maps to <c>gst.gst_return_audit</c> (migration 096).
    /// </summary>
    DbSet<GstReturnAudit> GstReturnAudits { get; }

    // ── DG-GST-04: Late fee + interest rate tables (migration 101) ───────────

    /// <summary>
    /// Config-driven late-fee rate lookup table.
    /// Maps to <c>gst.gst_late_fee_rate</c> (migration 101).
    /// Never hardcode per-day penalty amounts — read from this table.
    /// </summary>
    DbSet<GstLateFeeRate> GstLateFeeRates { get; }

    /// <summary>
    /// Config-driven interest rate (CGST Act Section 50) lookup table.
    /// Maps to <c>gst.gst_interest_rate</c> (migration 101).
    /// </summary>
    DbSet<GstInterestRate> GstInterestRates { get; }

    // ── DG-GST-05: Org profile for e-invoice threshold (migration 102) ────────

    /// <summary>
    /// Per-org GST profile storing annual turnover for e-invoice mandate checks.
    /// Maps to <c>gst.gst_org_profile</c> (migration 102).
    /// </summary>
    DbSet<GstOrgProfile> GstOrgProfiles { get; }

    /// <summary>Persists changes to the gst schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
