using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.SimulateDrc;

/// <summary>
/// Pre-filing DRC-01B / DRC-01C simulator.
/// GAP-108: Runs the EXISTING reconciliation engine queries (no new data) for a period and
/// returns a "would-trigger" verdict + the mismatch lines so users see exposure BEFORE filing.
///
/// DRC-01B (Rule 88C): GSTR-1 reported tax liability vs GSTR-3B paid liability.
///   — If GSTR-3B tax paid &lt; GSTR-1 liability by any amount, portal auto-generates DRC-01B.
///   — Source: gst.gst_return rows for the org+period (GSTR-1 vs GSTR-3B).
///
/// DRC-01C (Rule 88D): ITC claimed in GSTR-3B vs ITC available in GSTR-2B.
///   — If claimed ITC &gt; available ITC by &gt; Rs.25 lakh or 20%, portal generates DRC-01C.
///   — Source: gst.itc_mismatches (OPEN/EXCESS_CLAIM rows for the period).
///
/// Contract: <see cref="SimulateDrcResponse.DataAvailable"/> = false when source data is absent.
/// NEVER silently fake a verdict — mark dataAvailable=false explicitly.
/// </summary>
public record SimulateDrcQuery(
    Guid OrganizationId,
    GstNoticeFormType FormType,
    string FinancialYear,
    int PeriodMonth) : IQuery<SimulateDrcResponse>;

/// <summary>Verdict returned by the DRC pre-filing simulator.</summary>
public record SimulateDrcResponse(
    GstNoticeFormType FormType,
    string FinancialYear,
    int PeriodMonth,
    bool DataAvailable,
    bool WouldTrigger,
    string VerdictSummary,
    IReadOnlyList<DrcMismatchLine> MismatchLines,
    decimal TotalExposureAmount);

/// <summary>A single mismatch line contributing to DRC exposure.</summary>
public record DrcMismatchLine(
    string Description,
    decimal Gstr1OrGstr2bAmount,
    decimal Gstr3bAmount,
    decimal DifferenceAmount,
    string MismatchType);

/// <summary>Validator for <see cref="SimulateDrcQuery"/>.</summary>
public sealed class SimulateDrcQueryValidator : AbstractValidator<SimulateDrcQuery>
{
    private static readonly GstNoticeFormType[] Supported =
        [GstNoticeFormType.DRC_01B, GstNoticeFormType.DRC_01C];

    public SimulateDrcQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.FormType)
            .Must(t => Supported.Contains(t))
            .WithMessage("SimulateDrc supports only DRC_01B and DRC_01C form types.");
        RuleFor(x => x.FinancialYear)
            .NotEmpty()
            .Matches(@"^\d{4}-\d{2}$")
            .WithMessage("FinancialYear must match yyyy-yy (e.g. 2025-26).");
        RuleFor(x => x.PeriodMonth).InclusiveBetween(1, 12);
    }
}

/// <summary>Handler for <see cref="SimulateDrcQuery"/>.</summary>
public sealed class SimulateDrcQueryHandler(IGstDbContext db, ICurrentUser currentUser)
    : IQueryHandler<SimulateDrcQuery, SimulateDrcResponse>
{
    /// <inheritdoc />
    public async Task<Result<SimulateDrcResponse>> Handle(
        SimulateDrcQuery request,
        CancellationToken cancellationToken)
    {
        // SEC-IDOR: caller must own the org
        if (currentUser.OrganizationId != request.OrganizationId)
            return Error.NotFound("Organization.NotFound", $"Organization {request.OrganizationId} not found.");

        return request.FormType switch
        {
            GstNoticeFormType.DRC_01B => await SimulateDrc01BAsync(request, cancellationToken),
            GstNoticeFormType.DRC_01C => await SimulateDrc01CAsync(request, cancellationToken),
            _ => Error.Validation("DrcSimulator.UnsupportedType",
                $"Form type {request.FormType} is not supported by the simulator.")
        };
    }

    // ── DRC-01B: GSTR-1 liability vs GSTR-3B paid ──────────────────────────

    private async Task<Result<SimulateDrcResponse>> SimulateDrc01BAsync(
        SimulateDrcQuery request, CancellationToken ct)
    {
        // Derive calendar year from FY + month (Indian FY April–March)
        var startYear = int.Parse(request.FinancialYear[..4]);
        var calendarYear = request.PeriodMonth >= 4 ? startYear : startYear + 1;

        // Load FILED GSTR-1 and GSTR-3B returns for the org+period
        var returns = await db.GstReturns
            .Where(r => r.OrganizationId == request.OrganizationId
                     && r.FinancialYear == request.FinancialYear
                     && r.PeriodMonth == request.PeriodMonth
                     && r.DeletedAt == null
                     && (r.ReturnType == "GSTR-1" || r.ReturnType == "GSTR-3B")
                     && r.Status == "FILED")
            .ToListAsync(ct);

        var gstr1 = returns.FirstOrDefault(r => r.ReturnType == "GSTR-1");
        var gstr3b = returns.FirstOrDefault(r => r.ReturnType == "GSTR-3B");

        if (gstr1 is null || gstr3b is null)
        {
            var missing = (gstr1 is null ? "GSTR-1" : "") + (gstr3b is null ? " GSTR-3B" : "");
            return new SimulateDrcResponse(
                request.FormType, request.FinancialYear, request.PeriodMonth,
                DataAvailable: false,
                WouldTrigger: false,
                VerdictSummary: $"Data not available — missing filed {missing.Trim()} for this period.",
                MismatchLines: [],
                TotalExposureAmount: 0m);
        }

        // DRC-01B triggers when GSTR-3B total tax paid < GSTR-1 total liability (any difference)
        var gstr1Liability = gstr1.TotalIgst + gstr1.TotalCgst + gstr1.TotalSgst + gstr1.TotalCess;
        var gstr3bPaid = gstr3b.TotalIgst + gstr3b.TotalCgst + gstr3b.TotalSgst + gstr3b.TotalCess;
        var difference = gstr1Liability - gstr3bPaid;

        var lines = new List<DrcMismatchLine>();
        var wouldTrigger = false;
        string verdict;

        if (difference > 0)
        {
            wouldTrigger = true;
            verdict = $"DRC-01B would be triggered. GSTR-1 reported tax ₹{gstr1Liability:N2} " +
                      $"exceeds GSTR-3B paid tax ₹{gstr3bPaid:N2} by ₹{difference:N2}.";

            if (gstr1.TotalIgst != gstr3b.TotalIgst)
                lines.Add(new("IGST mismatch", gstr1.TotalIgst, gstr3b.TotalIgst,
                    gstr1.TotalIgst - gstr3b.TotalIgst, "IGST_UNDERPAYMENT"));
            if (gstr1.TotalCgst != gstr3b.TotalCgst)
                lines.Add(new("CGST mismatch", gstr1.TotalCgst, gstr3b.TotalCgst,
                    gstr1.TotalCgst - gstr3b.TotalCgst, "CGST_UNDERPAYMENT"));
            if (gstr1.TotalSgst != gstr3b.TotalSgst)
                lines.Add(new("SGST/UTGST mismatch", gstr1.TotalSgst, gstr3b.TotalSgst,
                    gstr1.TotalSgst - gstr3b.TotalSgst, "SGST_UNDERPAYMENT"));
            if (gstr1.TotalCess != gstr3b.TotalCess)
                lines.Add(new("Cess mismatch", gstr1.TotalCess, gstr3b.TotalCess,
                    gstr1.TotalCess - gstr3b.TotalCess, "CESS_UNDERPAYMENT"));
        }
        else if (difference < 0)
        {
            verdict = $"No DRC-01B risk. GSTR-3B tax paid ₹{gstr3bPaid:N2} exceeds GSTR-1 " +
                      $"liability ₹{gstr1Liability:N2} (excess of ₹{Math.Abs(difference):N2}).";
        }
        else
        {
            verdict = "No DRC-01B risk. GSTR-1 liability and GSTR-3B paid tax are exactly equal.";
        }

        return new SimulateDrcResponse(
            request.FormType, request.FinancialYear, request.PeriodMonth,
            DataAvailable: true,
            WouldTrigger: wouldTrigger,
            VerdictSummary: verdict,
            MismatchLines: lines,
            TotalExposureAmount: Math.Max(0m, difference));
    }

    // ── DRC-01C: GSTR-3B claimed ITC vs GSTR-2B available ITC ──────────────

    private async Task<Result<SimulateDrcResponse>> SimulateDrc01CAsync(
        SimulateDrcQuery request, CancellationToken ct)
    {
        // DRC-01C uses the EXISTING ITC reconciliation engine output (gst.itc_mismatches)
        // Load OPEN mismatches of type EXCESS_CLAIM or AMOUNT_MISMATCH for this org+period.
        // Period filter: itc_mismatches doesn't carry period directly — we proxy via
        // the DeletedAt=null and org filter (full set; per-period drill would need an itc_record join).
        // GAP-108: full period-scoped query requires ItcRecord date join — added here.

        var startYear = int.Parse(request.FinancialYear[..4]);
        var calendarYear = request.PeriodMonth >= 4 ? startYear : startYear + 1;

        // Load ITC records (2B-sourced) for the period — the existing reconciliation engine
        // already computed mismatches but we need period scoping via the ItcRecord date.
        var periodItcRecordIds = await db.ItcRecords
            .Where(r => r.OrganizationId == request.OrganizationId
                     && r.Source == "GSTR_2B"
                     && r.DeletedAt == null
                     && r.InvoiceDate.Year == calendarYear
                     && r.InvoiceDate.Month == request.PeriodMonth)
            .Select(r => r.Id)
            .ToListAsync(ct);

        if (periodItcRecordIds.Count == 0)
        {
            // Also check if GSTR-3B for the period exists to differentiate "no data" from
            // "reconciliation not yet run" from "genuine nil period"
            var has3b = await db.GstReturns
                .Where(r => r.OrganizationId == request.OrganizationId
                         && r.FinancialYear == request.FinancialYear
                         && r.PeriodMonth == request.PeriodMonth
                         && r.ReturnType == "GSTR-3B"
                         && r.DeletedAt == null)
                .AnyAsync(ct);

            var reason = has3b
                ? "GSTR-2B ITC records not imported for this period. Run ITC reconciliation first."
                : "No GSTR-3B found for this period.";

            return new SimulateDrcResponse(
                request.FormType, request.FinancialYear, request.PeriodMonth,
                DataAvailable: false,
                WouldTrigger: false,
                VerdictSummary: $"Data not available — {reason}",
                MismatchLines: [],
                TotalExposureAmount: 0m);
        }

        // Load mismatches that are linked to the period's ITC records
        var mismatches = await db.ItcMismatches
            .Where(m => m.OrganizationId == request.OrganizationId
                     && m.Status == "OPEN"
                     && m.DeletedAt == null
                     && (m.MismatchType == "EXCESS_CLAIM" || m.MismatchType == "AMOUNT_MISMATCH")
                     && m.ItcRecordId != null
                     && periodItcRecordIds.Contains(m.ItcRecordId!.Value))
            .ToListAsync(ct);

        if (mismatches.Count == 0)
        {
            return new SimulateDrcResponse(
                request.FormType, request.FinancialYear, request.PeriodMonth,
                DataAvailable: true,
                WouldTrigger: false,
                VerdictSummary: "No DRC-01C risk. No ITC excess claims or amount mismatches detected for this period.",
                MismatchLines: [],
                TotalExposureAmount: 0m);
        }

        // DRC-01C threshold: excess > Rs.25 lakh OR > 20% of available ITC (Rule 88D)
        // Config-driven thresholds (default per Rule 88D):
        var totalExcess = mismatches.Sum(m => Math.Max(0m, m.ClaimedAmount - m.AvailableAmount));
        var totalAvailable = mismatches.Sum(m => m.AvailableAmount);
        var excessPct = totalAvailable > 0 ? (totalExcess / totalAvailable) * 100m : 100m;

        // Rule 88D thresholds (hardcoded here ONLY as reference for the verdict string;
        // the underlying data that drives this comes from gst.itc_mismatches which is DB-driven)
        const decimal ThresholdAmount = 2500000m; // Rs.25 lakh
        const decimal ThresholdPercent = 20m;

        var wouldTrigger = totalExcess > ThresholdAmount || excessPct > ThresholdPercent;

        var lines = mismatches.Select(m => new DrcMismatchLine(
            $"ITC {m.MismatchType} on itc_record {m.ItcRecordId}",
            m.AvailableAmount,
            m.ClaimedAmount,
            Math.Max(0m, m.ClaimedAmount - m.AvailableAmount),
            m.MismatchType)).ToList();

        var verdict = wouldTrigger
            ? $"DRC-01C would be triggered. Excess ITC claimed: ₹{totalExcess:N2} " +
              $"({excessPct:N1}% of available). " +
              $"Rule 88D threshold: ₹25L or 20% of available ITC."
            : $"No DRC-01C risk. Excess ITC ₹{totalExcess:N2} ({excessPct:N1}%) " +
              $"is below Rule 88D trigger thresholds (₹25L / 20%).";

        return new SimulateDrcResponse(
            request.FormType, request.FinancialYear, request.PeriodMonth,
            DataAvailable: true,
            WouldTrigger: wouldTrigger,
            VerdictSummary: verdict,
            MismatchLines: lines,
            TotalExposureAmount: totalExcess);
    }
}
