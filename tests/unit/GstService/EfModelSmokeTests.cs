using FluentAssertions;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GstService.Tests;

/// <summary>
/// EF model smoke tests for GstService — validates that the EF Core model can generate
/// SQL for every DbSet without schema errors.
///
/// Uses real local PostgreSQL (localhost:5432) to ensure column/table mapping is accurate.
/// These tests catch EF↔DB divergences (the class of bugs fixed in WEB-01..WEB-02).
///
/// House rule: use full SELECT projections (ToListAsync / Select(...)) rather than
/// AnyAsync() — AnyAsync() emits "SELECT 1 FROM table LIMIT 1" which does NOT
/// materialise column names and therefore cannot surface EF↔DB column mapping errors.
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class GstEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static GstDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<GstDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new GstDbContext(options);
    }

    // ── Core returns / invoices ──────────────────────────────────────────────

    [Fact]
    public async Task GstReturns_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Full projection materialises column names — catches EF↔DB mismatches.
        var act = async () => await db.GstReturns
            .Select(r => new { r.Id, r.OrganizationId, r.ReturnType, r.Status, r.FinancialYear, r.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_return must be correct");
    }

    [Fact]
    public async Task GstNotices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstNotices
            .Select(n => new { n.Id, n.OrganizationId, n.NoticeNumber, n.Status, n.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.notices must be correct (WEB-01 fix)");
    }

    [Fact]
    public async Task ItcMismatches_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ItcMismatches
            .Select(m => new { m.Id, m.OrganizationId, m.MismatchType, m.Status, m.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.itc_mismatch must be correct (WEB-02 fix)");
    }

    [Fact]
    public async Task GstRefunds_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstRefunds
            .Select(r => new { r.Id, r.OrganizationId, r.Status, r.ClaimedAmount, r.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_refund must be correct");
    }

    [Fact]
    public async Task GstAnnualReturns_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.GstAnnualReturns
            .Select(r => new { r.Id, r.OrganizationId, r.Status, r.FinancialYear, r.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.gst_annual_return must be correct");
    }

    [Fact]
    public async Task LutFilings_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.LutFilings
            .Select(l => new { l.Id, l.OrganizationId, l.Status, l.FinancialYear, l.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.lut_filing must be correct");
    }

    [Fact]
    public async Task ItcRecords_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.ItcRecords
            .Select(r => new { r.Id, r.OrganizationId, r.SupplierGstin, r.Source, r.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for gst.itc_record must be correct");
    }

    // ── IMS (Invoice Management System) — GAP-101, migration 074 ────────────

    [Fact]
    public async Task ImsInvoices_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Materialises all columns including: status, deemed_accepted, actioned_at,
        // actioned_by, rejection_reason, period, source, supplier_gstin.
        var act = async () => await db.ImsInvoices
            .Select(i => new
            {
                i.Id,
                i.OrganizationId,
                i.SupplierGstin,
                i.SupplierName,
                i.InvoiceNumber,
                i.InvoiceDate,
                i.InvoiceValue,
                i.TaxableValue,
                i.IgstAmount,
                i.CgstAmount,
                i.SgstAmount,
                i.CessAmount,
                i.Period,
                i.Source,
                i.Status,
                i.ActionedAt,
                i.ActionedBy,
                i.DeemedAccepted,
                i.RejectionReason,
                i.CreatedAt,
                i.UpdatedAt,
                i.DeletedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for gst.ims_invoices must be correct (migration 074)");
    }

    [Fact]
    public async Task ImsActionLogs_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Append-only table — no soft-delete filter.
        // Note: ImsActionLog inherits BaseEntity (not BaseAuditableEntity) so
        // CreatedAt is not an EF-mapped property (it is DB-generated via now()).
        var act = async () => await db.ImsActionLogs
            .Select(l => new
            {
                l.Id,
                l.ImsInvoiceId,
                l.OrganizationId,
                l.Action,
                l.PreviousStatus,
                l.NewStatus,
                l.ActedAt,
                l.ActedBy,
                l.Reason,
                l.IsBulk
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for gst.ims_action_logs must be correct (migration 074, append-only)");
    }

    [Fact]
    public async Task Gstr1aAmendments_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Gstr1aAmendments
            .Select(a => new { a.Id, a.OrganizationId, a.Status, a.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for gst.gstr1a_amendments must be correct (migration 074)");
    }
}
