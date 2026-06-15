using System.Security.Cryptography;
using System.Xml.Linq;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// GAP-032: Tally XML export generator.
/// Produces a Tally-importable XML file with the standard ENVELOPE/TALLYMESSAGE structure
/// covering Vouchers, Ledgers, and Masters for the given org and date range.
///
/// Tally Prime / ERP 9 import XML structure:
/// <code>
/// &lt;ENVELOPE&gt;
///   &lt;HEADER&gt;&lt;VERSION&gt;1&lt;/VERSION&gt;&lt;TALLYREQUEST&gt;Import Data&lt;/TALLYREQUEST&gt;&lt;/HEADER&gt;
///   &lt;BODY&gt;
///     &lt;IMPORTDATA&gt;...Masters (Ledgers)...&lt;/IMPORTDATA&gt;
///     &lt;IMPORTDATA&gt;...Vouchers...&lt;/IMPORTDATA&gt;
///   &lt;/BODY&gt;
/// &lt;/ENVELOPE&gt;
/// </code>
///
/// Cross-schema read: reads accounting.account + accounting.journal_entry (+ journal_entry_line)
/// via raw SQL on the same PostgreSQL database (read-only).
/// BUG-W7-04: original code referenced accounting.chart_of_accounts / accounting.journal_entries
/// which do not exist. Corrected to accounting.account and accounting.journal_entry per the
/// canonical schema (migration 003, confirmed in ChartOfAccountConfiguration.cs and
/// JournalBatchConfiguration.cs SWEEP-FIX WEB-14 comments).
///
/// Feature flag: <c>Report:TallyExportEnabled=true</c> in configuration.
/// When flag is false (default) → CSV fallback is returned instead.
/// Format override: TallyExport always returns XML (or CSV fallback) regardless of
/// the ReportFormat enum value — the generator ignores the format field.
/// </summary>
public sealed class TallyExportGenerator(
    IReportStorageService storage,
    IConfiguration configuration,
    ILogger<TallyExportGenerator> logger) : IReportGenerator
{
    /// <inheritdoc />
    public bool Supports(ReportType reportType, ReportFormat format)
        => reportType == ReportType.TallyExport;

    /// <inheritdoc />
    public async Task<ReportGenerationResult> GenerateAsync(ReportJob job, CancellationToken ct)
    {
        var isTallyEnabled = IsTallyExportEnabled();

        byte[] fileBytes;
        string contentType;
        string extension;

        if (isTallyEnabled)
        {
            var xml = await BuildTallyXmlAsync(job, ct);
            fileBytes = System.Text.Encoding.UTF8.GetBytes(xml);
            contentType = "application/xml";
            extension = "xml";
            logger.LogInformation("TallyExportGenerator: Generated Tally XML for org {OrgId}", job.OrgId);
        }
        else
        {
            var csv = await BuildCsvFallbackAsync(job, ct);
            fileBytes = System.Text.Encoding.UTF8.GetBytes(csv);
            contentType = "text/csv";
            extension = "csv";
            logger.LogInformation(
                "TallyExportGenerator: TallyExportEnabled=false for org {OrgId} — generating CSV fallback",
                job.OrgId);
        }

        var sha256Hex = Convert.ToHexString(SHA256.HashData(fileBytes)).ToLowerInvariant();

        var bucketName = Environment.GetEnvironmentVariable("GCS_REPORTS_BUCKET")
            ?? configuration["GCS:ReportsBucket"]
            ?? "snapaccount-reports-dev";

        var objectName = $"reports/{job.OrgId}/tally/{job.Id}.{extension}";
        var gcsUri = await storage.UploadAsync(bucketName, objectName, fileBytes, contentType, ct);

        return new ReportGenerationResult(gcsUri, sha256Hex, 0);
    }

    // ── Feature flag ─────────────────────────────────────────────────────────

    private bool IsTallyExportEnabled()
    {
        var configValue = configuration["Report:TallyExportEnabled"];
        return bool.TryParse(configValue, out var enabled) && enabled;
    }

    // ── XML builder ──────────────────────────────────────────────────────────

    private async Task<string> BuildTallyXmlAsync(ReportJob job, CancellationToken ct)
    {
        var periodStart = job.PeriodStart ?? new DateTime(DateTime.UtcNow.Year, 4, 1);
        var periodEnd = job.PeriodEnd ?? DateTime.UtcNow;

        var ledgers = await FetchLedgersAsync(job.OrgId, ct);
        var vouchers = await FetchVouchersAsync(job.OrgId, periodStart, periodEnd, ct);

        // Tally Prime XML envelope
        var envelope = new XElement("ENVELOPE",
            new XElement("HEADER",
                new XElement("VERSION", "1"),
                new XElement("TALLYREQUEST", "Import Data"),
                new XElement("TYPE", "Data"),
                new XElement("SUBTYPE", "Master and Vouchers")),
            new XElement("BODY",
                // Masters section: Chart of Accounts → Tally Ledger masters
                new XElement("IMPORTDATA",
                    new XElement("REQUESTDESC",
                        new XElement("REPORTNAME", "All Masters"),
                        new XElement("STATICVARIABLES",
                            new XElement("SVCURRENTCOMPANY", job.OrgId.ToString()))),
                    new XElement("REQUESTDATA",
                        ledgers.Select(BuildLedgerMaster))),
                // Vouchers section: Journal entries → Tally Vouchers
                new XElement("IMPORTDATA",
                    new XElement("REQUESTDESC",
                        new XElement("REPORTNAME", "Vouchers"),
                        new XElement("STATICVARIABLES",
                            new XElement("SVCURRENTCOMPANY", job.OrgId.ToString()))),
                    new XElement("REQUESTDATA",
                        vouchers.Select(BuildVoucher)))));

        return new XDocument(
            new XDeclaration("1.0", "UTF-8", "yes"),
            envelope).ToString();
    }

    private static XElement BuildLedgerMaster(LedgerRow l)
        => new("TALLYMESSAGE",
            new XAttribute(XNamespace.Xmlns + "UDF", "TallyUDF"),
            new XElement("LEDGER",
                new XAttribute("NAME", l.Name),
                new XAttribute("RESERVEDNAME", ""),
                new XElement("NAME", l.Name),
                new XElement("PARENT", l.ParentGroup),
                new XElement("OPENINGBALANCE", l.OpeningBalance.ToString("F2")),
                new XElement("CURRENCYNAME", "INR")));

    private static XElement BuildVoucher(VoucherRow v)
        => new("TALLYMESSAGE",
            new XAttribute(XNamespace.Xmlns + "UDF", "TallyUDF"),
            new XElement("VOUCHER",
                new XAttribute("REMOTEID", v.Id.ToString()),
                new XAttribute("VCHTYPE", v.VoucherType),
                new XAttribute("ACTION", "Create"),
                new XElement("DATE", v.Date.ToString("yyyyMMdd")),
                new XElement("NARRATION", v.Narration ?? ""),
                new XElement("VOUCHERTYPENAME", v.VoucherType),
                new XElement("VOUCHERNUMBER", v.ReferenceNumber ?? v.Id.ToString()),
                new XElement("ALLLEDGERENTRIES.LIST",
                    new XElement("LEDGERNAME", v.DebitLedger),
                    new XElement("ISDEEMEDPOSITIVE", "Yes"),
                    new XElement("AMOUNT", (-v.Amount).ToString("F2"))),
                new XElement("ALLLEDGERENTRIES.LIST",
                    new XElement("LEDGERNAME", v.CreditLedger),
                    new XElement("ISDEEMEDPOSITIVE", "No"),
                    new XElement("AMOUNT", v.Amount.ToString("F2")))));

    // ── CSV fallback ─────────────────────────────────────────────────────────

    private async Task<string> BuildCsvFallbackAsync(ReportJob job, CancellationToken ct)
    {
        var periodStart = job.PeriodStart ?? new DateTime(DateTime.UtcNow.Year, 4, 1);
        var periodEnd = job.PeriodEnd ?? DateTime.UtcNow;
        var vouchers = await FetchVouchersAsync(job.OrgId, periodStart, periodEnd, ct);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Date,VoucherType,ReferenceNumber,DebitLedger,CreditLedger,Amount,Narration");
        foreach (var v in vouchers)
        {
            sb.AppendLine(string.Join(",",
                v.Date.ToString("yyyy-MM-dd"),
                QuoteCsv(v.VoucherType),
                QuoteCsv(v.ReferenceNumber ?? ""),
                QuoteCsv(v.DebitLedger),
                QuoteCsv(v.CreditLedger),
                v.Amount.ToString("F2"),
                QuoteCsv(v.Narration ?? "")));
        }
        return sb.ToString();
    }

    private static string QuoteCsv(string value)
        => value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;

    // ── Cross-schema data access (raw Npgsql, read-only) ─────────────────────

    private string GetConnectionString()
    {
        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        return (configuration.GetConnectionString("DefaultConnection")
            ?? configuration.GetConnectionString("snapaccount")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);
    }

    private async Task<List<LedgerRow>> FetchLedgersAsync(Guid orgId, CancellationToken ct)
    {
        var results = new List<LedgerRow>();
        try
        {
            await using var conn = new NpgsqlConnection(GetConnectionString());
            await conn.OpenAsync(ct);
            await using var cmd = new NpgsqlCommand("""
                SELECT id, account_name, account_type,
                       0 AS opening_balance
                FROM   accounting.account
                WHERE  organization_id = @orgId
                  AND  deleted_at IS NULL
                ORDER  BY account_name
                """, conn);
            cmd.Parameters.AddWithValue("orgId", orgId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                results.Add(new LedgerRow(
                    reader.GetGuid(0),
                    reader.GetString(1),
                    MapTallyGroup(reader.GetString(2)),
                    reader.GetDecimal(3)));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "TallyExportGenerator: Could not read accounting.account for org {OrgId}. Returning empty ledgers.",
                orgId);
        }
        return results;
    }

    private async Task<List<VoucherRow>> FetchVouchersAsync(
        Guid orgId, DateTime periodStart, DateTime periodEnd, CancellationToken ct)
    {
        var results = new List<VoucherRow>();
        try
        {
            await using var conn = new NpgsqlConnection(GetConnectionString());
            await conn.OpenAsync(ct);
            // BUG-W7-04 FIX: corrected table names and column references.
            // accounting.journal_entry (not journal_entries), accounting.journal_entry_line
            // (not journal_entry_lines), accounting.account (not chart_of_accounts).
            // journal_entry_line uses debit_amount/credit_amount (not entry_type='DEBIT').
            // Debit leg = line with debit_amount > 0; credit leg = line with credit_amount > 0.
            await using var cmd = new NpgsqlCommand("""
                SELECT je.id, je.entry_date,
                       je.entry_number   AS reference_number,
                       je.description    AS narration,
                       COALESCE(deb.account_name, 'Unknown Debit')   AS debit_ledger,
                       COALESCE(cred.account_name, 'Unknown Credit') AS credit_ledger,
                       COALESCE(je.total_debit, 0)                   AS amount
                FROM   accounting.journal_entry je
                LEFT JOIN LATERAL (
                    SELECT a.account_name
                    FROM   accounting.journal_entry_line jl
                    JOIN   accounting.account a ON a.id = jl.account_id
                    WHERE  jl.journal_entry_id = je.id
                      AND  jl.debit_amount > 0
                    ORDER  BY jl.line_number
                    LIMIT  1
                ) deb(account_name) ON TRUE
                LEFT JOIN LATERAL (
                    SELECT a.account_name
                    FROM   accounting.journal_entry_line jl
                    JOIN   accounting.account a ON a.id = jl.account_id
                    WHERE  jl.journal_entry_id = je.id
                      AND  jl.credit_amount > 0
                    ORDER  BY jl.line_number
                    LIMIT  1
                ) cred(account_name) ON TRUE
                WHERE  je.organization_id = @orgId
                  AND  je.entry_date BETWEEN @start AND @end
                  AND  je.deleted_at IS NULL
                ORDER  BY je.entry_date, je.id
                LIMIT  10000
                """, conn);
            cmd.Parameters.AddWithValue("orgId", orgId);
            cmd.Parameters.AddWithValue("start", periodStart);
            cmd.Parameters.AddWithValue("end", periodEnd);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                results.Add(new VoucherRow(
                    reader.GetGuid(0),
                    reader.GetDateTime(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetDecimal(6),
                    "Journal"));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "TallyExportGenerator: Could not read accounting.journal_entry for org {OrgId}. Returning empty vouchers.",
                orgId);
        }
        return results;
    }

    private static string MapTallyGroup(string accountType) => accountType switch
    {
        "ASSET" or "asset" => "Current Assets",
        "LIABILITY" or "liability" => "Current Liabilities",
        "EQUITY" or "equity" => "Capital Account",
        "REVENUE" or "revenue" => "Sales Accounts",
        "EXPENSE" or "expense" => "Direct Expenses",
        _ => "Sundry Debtors"
    };

    // ── Internal row types ────────────────────────────────────────────────────

    private sealed record LedgerRow(Guid Id, string Name, string ParentGroup, decimal OpeningBalance);

    private sealed record VoucherRow(
        Guid Id, DateTime Date, string? ReferenceNumber, string? Narration,
        string DebitLedger, string CreditLedger, decimal Amount, string VoucherType);
}
