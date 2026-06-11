using GstService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Mock IMS GSTN client — used when <c>GST_PRODUCTION_APIS_ENABLED</c> is not "true".
/// Generates deterministic, plausible inward invoices using a period-seeded RNG.
/// The seed formula ensures the same period always returns the same invoice set
/// (important for idempotent sync tests).
///
/// Mock supplier GSTINs use the GSTN test-GSTIN pattern: 29AABCU9603R1ZX (Karnataka dummy).
/// Invoice numbers follow the pattern: MOCK/YYYYMM/NNN.
/// </summary>
public sealed class MockImsGstnClient(ILogger<MockImsGstnClient> logger) : IImsGstnClient
{
    // Fixed set of mock suppliers — deterministic, covers different states
    private static readonly MockSupplier[] MockSuppliers =
    [
        new("29AABCU9603R1ZX", "Acme Supplies Pvt Ltd",   "Karnataka"),
        new("27AAGCS9911D1ZM", "Mumbai Trading Co",         "Maharashtra"),
        new("07AABCC1234C1ZA", "Delhi Tech Solutions Ltd",  "Delhi"),
        new("33AAHCS0618B1ZV", "Chennai Electronics Pvt",   "Tamil Nadu"),
        new("24AAHCD5436H1ZN", "Gujarat Textiles Ltd",      "Gujarat"),
    ];

    /// <inheritdoc />
    public Task<ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>> GetImsInvoicesAsync(
        string gstin, string period, CancellationToken ct = default)
    {
        logger.LogInformation("[MOCK-IMS] GetImsInvoices gstin={Gstin} period={Period}", gstin, period);

        // Deterministic seed: hash of (gstin + period) so same inputs = same output
        var seed = HashSeed(gstin, period);
        var rng = new Random(seed);

        // Generate between 3 and 8 invoices per period (seeded)
        var count = rng.Next(3, 9);
        var records = new List<ImsInvoiceRecord>(count);

        for (var i = 1; i <= count; i++)
        {
            var supplier = MockSuppliers[rng.Next(MockSuppliers.Length)];
            var invoiceDate = GenerateInvoiceDate(period, rng);
            var taxableValue = Math.Round((decimal)(rng.NextDouble() * 90000 + 10000), 2);
            var rate = rng.Next(0, 4) switch { 0 => 5m, 1 => 12m, 2 => 18m, _ => 28m };
            var totalTax = Math.Round(taxableValue * rate / 100m, 2);
            // IGST or CGST+SGST split based on supplier state vs org state (mock: random)
            var isIgst = rng.Next(2) == 0;
            var igst = isIgst ? totalTax : 0m;
            var cgst = isIgst ? 0m : Math.Round(totalTax / 2m, 2);
            var sgst = isIgst ? 0m : totalTax - cgst;
            var invoiceValue = taxableValue + igst + cgst + sgst;

            records.Add(new ImsInvoiceRecord(
                SupplierGstin: supplier.Gstin,
                SupplierName: supplier.Name,
                InvoiceNumber: $"MOCK/{period}/{i:D3}",
                InvoiceDate: invoiceDate,
                InvoiceValue: Math.Round(invoiceValue, 2),
                TaxableValue: taxableValue,
                IgstAmount: igst,
                CgstAmount: cgst,
                SgstAmount: sgst,
                CessAmount: 0m,
                Source: rng.Next(5) == 0 ? "IFF" : "GSTR-1")); // 1 in 5 comes via IFF
        }

        var result = new ImsApiResult<IReadOnlyList<ImsInvoiceRecord>>(
            IsSuccess: true,
            Data: records,
            RedactedResponseJson: $"{{\"count\":{count},\"period\":\"{period}\",\"mock\":true}}",
            ErrorMessage: null);

        return Task.FromResult(result);
    }

    /// <inheritdoc />
    public Task<ImsApiResult<string>> SubmitActionAsync(
        string gstin, string period, string invoiceNumber,
        string supplierGstin, string action, string? reason, CancellationToken ct = default)
    {
        logger.LogInformation(
            "[MOCK-IMS] SubmitAction gstin={Gstin} period={Period} invoice={Invoice} action={Action}",
            gstin, period, invoiceNumber, action);

        var mockRef = $"IMS-{DateTime.UtcNow:yyyyMMddHHmmssff}-MOCK";
        return Task.FromResult(new ImsApiResult<string>(
            IsSuccess: true,
            Data: mockRef,
            RedactedResponseJson: $"{{\"ref\":\"{mockRef}\",\"status\":\"SUCCESS\"}}",
            ErrorMessage: null));
    }

    /// <inheritdoc />
    public Task<ImsApiResult<string>> SubmitBulkActionsAsync(
        string gstin, string period,
        IReadOnlyList<ImsBulkActionItem> actions, CancellationToken ct = default)
    {
        logger.LogInformation(
            "[MOCK-IMS] SubmitBulkActions gstin={Gstin} period={Period} count={Count}",
            gstin, period, actions.Count);

        var mockRef = $"IMS-BULK-{DateTime.UtcNow:yyyyMMddHHmmssff}-MOCK";
        return Task.FromResult(new ImsApiResult<string>(
            IsSuccess: true,
            Data: mockRef,
            RedactedResponseJson: $"{{\"ref\":\"{mockRef}\",\"count\":{actions.Count},\"status\":\"QUEUED\"}}",
            ErrorMessage: null));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static int HashSeed(string gstin, string period)
    {
        unchecked
        {
            var hash = 17;
            foreach (var c in gstin + period)
                hash = hash * 31 + c;
            return hash;
        }
    }

    private static DateOnly GenerateInvoiceDate(string period, Random rng)
    {
        // period = MMYYYY
        if (period.Length == 6
            && int.TryParse(period[..2], out var month)
            && int.TryParse(period[2..], out var year)
            && month is >= 1 and <= 12)
        {
            var day = rng.Next(1, DateTime.DaysInMonth(year, month) + 1);
            return new DateOnly(year, month, day);
        }
        return DateOnly.FromDateTime(DateTime.UtcNow);
    }

    private sealed record MockSupplier(string Gstin, string Name, string State);
}
