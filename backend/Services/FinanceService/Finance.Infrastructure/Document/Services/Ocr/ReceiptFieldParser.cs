using System.Globalization;
using System.Text.RegularExpressions;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// Provider-agnostic heuristic parser that turns raw OCR text (e.g. from Tesseract)
/// into the structured fields SnapAccount cares about for Indian bills/receipts:
/// vendor, total amount, document date, GSTIN, invoice number, and GST/tax rate.
///
/// This is intentionally best-effort — cloud providers (Gemini/Document AI) return
/// structured fields directly; this fills the gap for the free, offline Tesseract path.
/// </summary>
public static partial class ReceiptFieldParser
{
    public sealed record ParsedReceipt(
        string? VendorName,
        decimal? Amount,
        DateOnly? DocumentDate,
        string? Gstin,
        string? InvoiceNumber,
        decimal? GstRate,
        IReadOnlyDictionary<string, string> Fields,
        decimal Confidence);

    // GSTIN: 2-digit state + 10-char PAN + entity digit + 'Z' + checksum char
    [GeneratedRegex(@"\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b", RegexOptions.IgnoreCase)]
    private static partial Regex GstinRegex();

    // Amounts like 1,23,456.78 (Indian grouping) / 1,234.56 / 1234 / ₹1,234.00 / Rs. 1234.50.
    // First alt requires at least one comma-group; plain integers (e.g. 4130.00) fall to the
    // second alt so they are captured whole (not truncated to the first 3 digits).
    [GeneratedRegex(@"(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)", RegexOptions.IgnoreCase)]
    private static partial Regex AmountRegex();

    // Common Indian date formats: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy, yyyy-mm-dd
    [GeneratedRegex(@"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b|\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b")]
    private static partial Regex DateRegex();

    // Intra-line only ([^\S\r\n] = whitespace except newline) so it can't grab a token off the
    // next line. The captured value must contain a digit (enforced in code) to avoid matching words.
    [GeneratedRegex(@"(?:invoice|inv|bill|receipt)[^\S\r\n]*(?:no\.?|number|#|:)+[^\S\r\n]*([A-Z0-9][A-Z0-9\-/]{2,})", RegexOptions.IgnoreCase)]
    private static partial Regex InvoiceNoRegex();

    [GeneratedRegex(@"(\d{1,2}(?:\.\d{1,2})?)\s*%")]
    private static partial Regex PercentRegex();

    private static readonly string[] GstRates = ["0", "5", "12", "18", "28"];

    public static ParsedReceipt Parse(string rawText)
    {
        var fields = new Dictionary<string, string>();
        var text = rawText ?? string.Empty;
        var lines = text.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

        // ── Vendor: first meaningful line (skip lines that are pure numbers/symbols) ──
        string? vendor = lines.FirstOrDefault(l =>
            l.Length >= 3 && l.Any(char.IsLetter) && l.Count(char.IsLetter) >= l.Length / 2);
        if (vendor is not null) fields["vendor_name"] = vendor;

        // ── GSTIN ──
        string? gstin = GstinRegex().Match(text) is { Success: true } gm ? gm.Value.ToUpperInvariant() : null;
        if (gstin is not null) fields["gstin"] = gstin;

        // ── Invoice number (must contain a digit to be a real number, not a word) ──
        string? invoiceNo = InvoiceNoRegex().Matches(text)
            .Select(m => m.Groups[1].Value)
            .FirstOrDefault(v => v.Any(char.IsDigit));
        if (invoiceNo is not null) fields["invoice_number"] = invoiceNo;

        // ── Amount: prefer a line containing total/grand/amount, else the max parsed value ──
        decimal? amount = ExtractAmount(lines, text);
        if (amount is not null) fields["amount"] = amount.Value.ToString(CultureInfo.InvariantCulture);

        // ── Date ──
        DateOnly? date = ExtractDate(text);
        if (date is not null) fields["document_date"] = date.Value.ToString("yyyy-MM-dd");

        // ── GST rate (closest of the legal slabs to any % found) ──
        decimal? gstRate = ExtractGstRate(text);
        if (gstRate is not null) fields["gst_rate"] = gstRate.Value.ToString(CultureInfo.InvariantCulture);

        // Confidence: fraction of the 5 key fields we managed to extract.
        var hits = new object?[] { vendor, amount, date, gstin, invoiceNo }.Count(x => x is not null);
        var confidence = Math.Round((decimal)hits / 5m, 2);

        return new ParsedReceipt(vendor, amount, date, gstin, invoiceNo, gstRate, fields, confidence);
    }

    private static decimal? ExtractAmount(string[] lines, string text)
    {
        // 1) Lines that look like a total.
        foreach (var line in lines)
        {
            if (Regex.IsMatch(line, @"\b(grand\s*total|total\s*amount|total|amount\s*payable|net\s*payable|balance\s*due)\b",
                    RegexOptions.IgnoreCase))
            {
                var m = AmountRegex().Matches(line).Select(x => TryAmount(x.Groups[1].Value)).Where(v => v.HasValue)
                    .Select(v => v!.Value).ToList();
                if (m.Count > 0) return m.Max();
            }
        }

        // 2) Fall back to the largest plausible amount in the whole document.
        var all = AmountRegex().Matches(text)
            .Select(x => TryAmount(x.Groups[1].Value))
            .Where(v => v is > 0 and < 100_000_000)
            .Select(v => v!.Value)
            .ToList();
        return all.Count > 0 ? all.Max() : null;
    }

    private static decimal? TryAmount(string raw)
        => decimal.TryParse(raw.Replace(",", ""), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static DateOnly? ExtractDate(string text)
    {
        var m = DateRegex().Match(text);
        if (!m.Success) return null;
        try
        {
            if (m.Groups[1].Success) // dd mm yyyy
            {
                int d = int.Parse(m.Groups[1].Value), mo = int.Parse(m.Groups[2].Value);
                int y = NormalizeYear(int.Parse(m.Groups[3].Value));
                if (mo is >= 1 and <= 12 && d is >= 1 and <= 31) return new DateOnly(y, mo, d);
            }
            else // yyyy mm dd
            {
                int y = int.Parse(m.Groups[4].Value), mo = int.Parse(m.Groups[5].Value), d = int.Parse(m.Groups[6].Value);
                if (mo is >= 1 and <= 12 && d is >= 1 and <= 31) return new DateOnly(y, mo, d);
            }
        }
        catch { /* malformed date — ignore */ }
        return null;
    }

    private static int NormalizeYear(int y) => y < 100 ? 2000 + y : y;

    private static decimal? ExtractGstRate(string text)
    {
        var pcts = PercentRegex().Matches(text)
            .Select(x => decimal.TryParse(x.Groups[1].Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : (decimal?)null)
            .Where(v => v.HasValue).Select(v => v!.Value).ToList();
        if (pcts.Count == 0) return null;
        // The total GST rate is the largest single percentage on the bill (CGST/SGST are halves of
        // it). Take the max, then snap to the nearest legal slab.
        var max = pcts.Max();
        return GstRates.Select(decimal.Parse).OrderBy(slab => Math.Abs(slab - max)).First();
    }
}
