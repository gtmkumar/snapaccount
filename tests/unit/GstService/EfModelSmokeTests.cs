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
        // W5-IMS-02: MUST include CreatedBy and UpdatedBy in projection.
        // These are character varying(128) in gst.ims_invoices (not uuid) — the
        // GuidStringConverter from BaseDbContext was incorrectly applied and caused
        // Npgsql InvalidCastException on full-entity materialisation.
        // The EfSmoke previously omitted CreatedBy/UpdatedBy, allowing the bug to
        // slip through. This gap is now closed.
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
                i.DeletedAt,
                // W5-IMS-02 gap closure — must be present to catch GuidStringConverter:
                i.CreatedBy,
                i.UpdatedBy
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for gst.ims_invoices must be correct (migration 074, W5-IMS-02 fix)");
    }

    [Fact]
    public async Task ImsInvoices_FullEntityMaterialise_WithActionLogInclude_WithoutError()
    {
        // W5-IMS-02 gap closure: the detail endpoint materialises the full ImsInvoice entity
        // (FirstOrDefaultAsync, no projection) and then loads ImsActionLogs.
        // A projection-only smoke test cannot catch converters that only fire on
        // full-entity load. This test replicates the detail handler's exact access pattern.
        using var db = CreateDbContext();
        var act = async () =>
        {
            // Full entity load — replicates GetImsInvoiceQueryHandler's FirstOrDefaultAsync.
            _ = await db.ImsInvoices
                .IgnoreQueryFilters() // bypass soft-delete filter so empty table doesn't short-circuit
                .FirstOrDefaultAsync();
            // Action log include — replicates the second query in the detail handler.
            _ = await db.ImsActionLogs
                .Select(l => new { l.Id, l.ImsInvoiceId, l.Action, l.PreviousStatus, l.NewStatus, l.ActedAt, l.ActedBy, l.Reason, l.IsBulk })
                .ToListAsync();
        };
        await act.Should().NotThrowAsync(
            "Full ImsInvoice entity materialisation must not throw (W5-IMS-02: GuidStringConverter override)");
    }

    [Fact]
    public async Task ImsActionLogs_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Append-only table — no soft-delete filter.
        // ImsActionLog inherits BaseEntity (not BaseAuditableEntity) so
        // CreatedBy/UpdatedBy are NOT EF-mapped properties (DB-generated via now()).
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
        // W5-IMS-02 gap closure: include CreatedBy and UpdatedBy — same varchar vs uuid
        // mismatch existed for gstr1a_amendments. Previously the projection omitted them.
        var act = async () => await db.Gstr1aAmendments
            .Select(a => new
            {
                a.Id,
                a.OrganizationId,
                a.OriginalImsInvoiceId,
                a.OriginalInvoiceNumber,
                a.OriginalSupplierGstin,
                a.AmendmentType,
                a.AmendmentPayloadJson,
                a.Period,
                a.Status,
                a.ArnNumber,
                a.FiledAt,
                a.CreatedAt,
                a.UpdatedAt,
                a.DeletedAt,
                // W5-IMS-02 gap closure:
                a.CreatedBy,
                a.UpdatedBy
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for gst.gstr1a_amendments must be correct (migration 074, W5-IMS-02 fix)");
    }
}
