using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ItrService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the itr schema database context.
/// Query handlers depend on this interface for direct LINQ projection (Jason Taylor pattern).
/// Write-side command handlers use repositories for aggregate lifecycle management.
/// </summary>
public interface IItrDbContext
{
    // ── Phase 6D new entities ──────────────────────────────────────────────────

    /// <summary>Assessee profiles in <c>itr.assessee_profiles</c>.</summary>
    DbSet<Assessee> Assessees { get; }

    /// <summary>ITR filings in <c>itr.filings</c>.</summary>
    DbSet<Filing> Filings { get; }

    /// <summary>
    /// Tax slab versions (read-only seed) in <c>itr.tax_slab_versions</c>.
    /// P6-HANDOFF-18: keyed by (ay, regime).
    /// </summary>
    DbSet<TaxSlabVersion> TaxSlabVersions { get; }

    /// <summary>Deduction section catalog (read-only seed) in <c>itr.deduction_sections</c>.</summary>
    DbSet<DeductionSection> DeductionSections { get; }

    /// <summary>Form 16 OCR extracts in <c>itr.form_16_extracts</c>.</summary>
    DbSet<Form16Extract> Form16Extracts { get; }

    /// <summary>ITR notices in <c>itr.notices</c>.</summary>
    DbSet<ItrNotice> ItrNotices { get; }

    /// <summary>Refund status polling log in <c>itr.refund_status_log</c>.</summary>
    DbSet<RefundStatusEntry> RefundStatusEntries { get; }

    /// <summary>Assessee-raised grievances in <c>itr.grievances</c> (P6-HANDOFF-23).</summary>
    DbSet<Grievance> Grievances { get; }

    /// <summary>
    /// Versioned computation history per filing in <c>itr.computation_versions</c>.
    /// DG-ITR-07: append-only; one row per ComputeTax call.
    /// </summary>
    DbSet<ComputationVersionEntry> ComputationVersions { get; }

    // ── Phase 5 legacy entities ─────────────────────────────────────────────

    /// <summary>Tax computation records in <c>itr.tax_computations</c>.</summary>
    DbSet<TaxComputation> TaxComputations { get; }

    /// <summary>Advance tax instalment records in <c>itr.advance_taxes</c>.</summary>
    DbSet<AdvanceTax> AdvanceTaxes { get; }

    /// <summary>Lower TDS certificates in <c>itr.lower_tds_certificates</c>.</summary>
    DbSet<LowerTdsCertificate> LowerTdsCertificates { get; }

    /// <summary>Specified person checks (206AB/206CCA) in <c>itr.specified_person_checks</c>.</summary>
    DbSet<SpecifiedPersonCheck> SpecifiedPersonChecks { get; }

    /// <summary>Transfer pricing reports (Form 3CEB) in <c>itr.transfer_pricing_reports</c>.</summary>
    DbSet<TransferPricingReport> TransferPricingReports { get; }

    /// <summary>Equalisation levy records in <c>itr.equalisation_levies</c>.</summary>
    DbSet<EqualisationLevy> EqualisationLevies { get; }

    /// <summary>Persists changes to the itr schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
