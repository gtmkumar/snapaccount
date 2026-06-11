using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace GstService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>gst</c> schema.
/// Implements <see cref="IGstDbContext"/> for query-handler direct projection (Jason Taylor pattern).
/// Audit stamping and domain event dispatch are handled by registered
/// <c>ISaveChangesInterceptor</c> instances.
/// </summary>
public class GstDbContext(DbContextOptions<GstDbContext> options)
    : BaseDbContext(options), IGstDbContext
{
    /// <inheritdoc />
    public DbSet<GstReturn> GstReturns => Set<GstReturn>();

    /// <inheritdoc />
    public DbSet<GstReturnLineItem> GstReturnLineItems => Set<GstReturnLineItem>();

    /// <inheritdoc />
    public DbSet<GstInvoice> GstInvoices => Set<GstInvoice>();

    /// <inheritdoc />
    public DbSet<GstTaxRate> GstTaxRates => Set<GstTaxRate>();

    /// <inheritdoc />
    public DbSet<HsnSacCode> HsnSacCodes => Set<HsnSacCode>();

    /// <inheritdoc />
    public DbSet<ItcRecord> ItcRecords => Set<ItcRecord>();

    /// <inheritdoc />
    public DbSet<ItcMismatch> ItcMismatches => Set<ItcMismatch>();

    /// <inheritdoc />
    public DbSet<GstNotice> GstNotices => Set<GstNotice>();

    /// <inheritdoc />
    public DbSet<EInvoice> EInvoices => Set<EInvoice>();

    /// <inheritdoc />
    public DbSet<EWayBill> EWayBills => Set<EWayBill>();

    /// <inheritdoc />
    public DbSet<GstReconciliation> GstReconciliations => Set<GstReconciliation>();

    /// <inheritdoc />
    public DbSet<GstRefund> GstRefunds => Set<GstRefund>();

    /// <inheritdoc />
    public DbSet<GstAnnualReturn> GstAnnualReturns => Set<GstAnnualReturn>();

    /// <inheritdoc />
    public DbSet<LutFiling> LutFilings => Set<LutFiling>();

    // ── IMS (Invoice Management System) — GAP-101, mandatory 1 Apr 2026 ──────

    /// <inheritdoc />
    public DbSet<ImsInvoice> ImsInvoices => Set<ImsInvoice>();

    /// <inheritdoc />
    public DbSet<ImsActionLog> ImsActionLogs => Set<ImsActionLog>();

    /// <inheritdoc />
    public DbSet<Gstr1aAmendment> Gstr1aAmendments => Set<Gstr1aAmendment>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("gst");
        // SEC-fix W5-IMS-02: base.OnModelCreating must run FIRST so that the global
        // GuidStringConverter for CreatedBy/UpdatedBy is applied before per-entity
        // IEntityTypeConfiguration classes run. Configurations that need to override
        // the converter (e.g. ImsInvoiceConfiguration, Gstr1aAmendmentConfiguration
        // where those columns are character varying(128), NOT uuid) call
        // HasConversion<string>() after this base call, which wins the last-write.
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(GstDbContext).Assembly);
    }
}
