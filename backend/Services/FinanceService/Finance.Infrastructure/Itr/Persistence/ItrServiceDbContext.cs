using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence.Configurations;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ItrService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>itr</c> schema.
/// Implements <see cref="IItrDbContext"/> for query-handler direct projection (Jason Taylor pattern).
/// Phase 6D: adds Assessee, Filing, TaxSlabVersion, DeductionSection, Form16Extract,
/// ItrNotice, RefundStatusEntry.
/// </summary>
public class ItrServiceDbContext(DbContextOptions<ItrServiceDbContext> options)
    : BaseDbContext(options), IItrDbContext
{
    // ── Phase 6D entities ──────────────────────────────────────────────────────

    /// <inheritdoc />
    public DbSet<Assessee> Assessees => Set<Assessee>();

    /// <inheritdoc />
    public DbSet<Filing> Filings => Set<Filing>();

    /// <inheritdoc />
    public DbSet<TaxSlabVersion> TaxSlabVersions => Set<TaxSlabVersion>();

    /// <inheritdoc />
    public DbSet<DeductionSection> DeductionSections => Set<DeductionSection>();

    /// <inheritdoc />
    public DbSet<Form16Extract> Form16Extracts => Set<Form16Extract>();

    /// <inheritdoc />
    public DbSet<ItrNotice> ItrNotices => Set<ItrNotice>();

    /// <inheritdoc />
    public DbSet<RefundStatusEntry> RefundStatusEntries => Set<RefundStatusEntry>();

    /// <inheritdoc />
    public DbSet<Grievance> Grievances => Set<Grievance>();

    // ── Phase 5 legacy entities ────────────────────────────────────────────────

    /// <inheritdoc />
    public DbSet<TaxComputation> TaxComputations => Set<TaxComputation>();

    /// <inheritdoc />
    public DbSet<AdvanceTax> AdvanceTaxes => Set<AdvanceTax>();

    /// <inheritdoc />
    public DbSet<LowerTdsCertificate> LowerTdsCertificates => Set<LowerTdsCertificate>();

    /// <inheritdoc />
    public DbSet<SpecifiedPersonCheck> SpecifiedPersonChecks => Set<SpecifiedPersonCheck>();

    /// <inheritdoc />
    public DbSet<TransferPricingReport> TransferPricingReports => Set<TransferPricingReport>();

    /// <inheritdoc />
    public DbSet<EqualisationLevy> EqualisationLevies => Set<EqualisationLevy>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("itr");
        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(ItrServiceDbContext).Assembly,
            type => type.Namespace == typeof(ItrNoticeConfiguration).Namespace);
        base.OnModelCreating(modelBuilder);
    }
}
