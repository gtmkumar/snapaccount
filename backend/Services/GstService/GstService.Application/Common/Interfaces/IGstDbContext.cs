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

    /// <summary>Persists changes to the gst schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
