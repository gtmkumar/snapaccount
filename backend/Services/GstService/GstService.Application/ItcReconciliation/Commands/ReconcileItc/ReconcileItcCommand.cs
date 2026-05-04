using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.ItcReconciliation.Commands.ReconcileItc;

/// <summary>
/// Reconciles input tax credit (ITC) for an organisation by comparing
/// books-side ITC claims (gst.itc_records sourced from GSTR-2B / 2A imports)
/// against books-side purchase invoices (gst.gst_invoices).
///
/// Produces gst.itc_mismatches rows for:
///   - AMOUNT_MISMATCH    — same supplier+invoice, claimed != available
///   - MISSING_IN_2B      — booked invoice with no matching ItcRecord
///   - EXCESS_CLAIM       — ItcRecord with no matching booked invoice
/// (Future: GSTN portal direct fetch, GSTIN_MISMATCH, DATE_MISMATCH variants.)
///
/// Idempotent: re-running for the same period clears OPEN mismatches first;
/// RESOLVED / IGNORED rows are preserved for audit.
/// </summary>
[RequiresPermission("gst.itc.reconcile")]
public record ReconcileItcCommand(
    Guid OrganizationId,
    string FinancialYear,
    int PeriodMonth,
    string ReconciliationType) : ICommand<ReconcileItcResponse>;

public record ReconcileItcResponse(
    Guid OrganizationId,
    string FinancialYear,
    int PeriodMonth,
    int MismatchesDetected,
    decimal TotalDifferenceAmount);

public sealed class ReconcileItcCommandValidator : AbstractValidator<ReconcileItcCommand>
{
    private static readonly string[] ValidTypes = ["GSTR_2A", "GSTR_2B"];

    public ReconcileItcCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.FinancialYear).NotEmpty().Matches(@"^\d{4}-\d{2}$")
            .WithMessage("FinancialYear must match yyyy-yy (e.g. 2025-26).");
        RuleFor(x => x.PeriodMonth).InclusiveBetween(1, 12);
        RuleFor(x => x.ReconciliationType).Must(t => ValidTypes.Contains(t))
            .WithMessage($"ReconciliationType must be one of: {string.Join(", ", ValidTypes)}");
    }
}

public sealed class ReconcileItcCommandHandler(IGstDbContext db, ICurrentUser currentUser)
    : ICommandHandler<ReconcileItcCommand, ReconcileItcResponse>
{
    public async Task<Result<ReconcileItcResponse>> Handle(ReconcileItcCommand request, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        // SEC-IDOR: caller must own the org being reconciled.
        if (currentUser.OrganizationId.Value != request.OrganizationId)
            return Error.NotFound("Organization.NotFound", $"Organization {request.OrganizationId} not found.");

        // Clear prior OPEN mismatches for this org/period — keep RESOLVED / IGNORED for audit.
        var existingOpen = await db.ItcMismatches
            .Where(m => m.OrganizationId == request.OrganizationId
                     && m.Status == "OPEN"
                     && m.DeletedAt == null)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var stale in existingOpen)
            stale.DeletedAt = now;

        // FY format yyyy-yy → start year. Indian FY runs Apr–Mar, so periodMonth 1–3
        // belongs to the SECOND calendar year (yy), 4–12 to the FIRST (yyyy).
        var startYear = int.Parse(request.FinancialYear[..4]);
        var calendarYear = request.PeriodMonth >= 4 ? startYear : startYear + 1;
        var month = request.PeriodMonth;

        // Load books-side claims for the period (GSTR_2A / GSTR_2B sourced).
        var claims = await db.ItcRecords
            .Where(r => r.OrganizationId == request.OrganizationId
                     && r.Source == request.ReconciliationType
                     && r.DeletedAt == null
                     && r.InvoiceDate.Year == calendarYear
                     && r.InvoiceDate.Month == month)
            .ToListAsync(ct);

        // Load books-side purchase invoices for the same period — match by supplier GSTIN + invoice number.
        var invoices = await db.GstInvoices
            .Where(i => i.OrganizationId == request.OrganizationId
                     && i.DeletedAt == null
                     && i.InvoiceDate.Year == calendarYear
                     && i.InvoiceDate.Month == month)
            .ToListAsync(ct);

        // Index for O(1) join.
        var invoicesByKey = invoices.ToDictionary(
            i => Key(i.SupplierGstin, i.InvoiceNumber),
            i => i);
        var claimsByKey = claims.ToDictionary(
            c => Key(c.SupplierGstin, c.InvoiceNumber),
            c => c);

        var mismatches = new List<ItcMismatch>();

        // Pass 1: AMOUNT_MISMATCH (same key, claimed != available) and MISSING_IN_2B
        foreach (var (key, invoice) in invoicesByKey)
        {
            if (!claimsByKey.TryGetValue(key, out var claim))
            {
                // Booked but no ITC record → MISSING_IN_2B (claimed = book ITC; available = 0)
                var bookItc = invoice.IgstAmount + invoice.CgstAmount + invoice.SgstAmount + invoice.CessAmount;
                if (bookItc > 0)
                    mismatches.Add(ItcMismatch.Detect(
                        request.OrganizationId, null, "MISSING_IN_2B", bookItc, 0m));
                continue;
            }

            var bookTotal = invoice.IgstAmount + invoice.CgstAmount + invoice.SgstAmount + invoice.CessAmount;
            if (bookTotal != claim.TotalItc)
                mismatches.Add(ItcMismatch.Detect(
                    request.OrganizationId, claim.Id, "AMOUNT_MISMATCH", bookTotal, claim.TotalItc));
        }

        // Pass 2: EXCESS_CLAIM (ItcRecord with no matching booked invoice)
        foreach (var (key, claim) in claimsByKey)
        {
            if (!invoicesByKey.ContainsKey(key))
                mismatches.Add(ItcMismatch.Detect(
                    request.OrganizationId, claim.Id, "EXCESS_CLAIM", 0m, claim.TotalItc));
        }

        foreach (var m in mismatches)
            db.ItcMismatches.Add(m);

        await db.SaveChangesAsync(ct);

        var totalDifference = mismatches.Sum(m => m.DifferenceAmount);

        return new ReconcileItcResponse(
            request.OrganizationId,
            request.FinancialYear,
            request.PeriodMonth,
            mismatches.Count,
            totalDifference);
    }

    private static string Key(string gstin, string invoiceNumber)
        => $"{gstin.ToUpperInvariant()}|{invoiceNumber.Trim().ToUpperInvariant()}";
}
