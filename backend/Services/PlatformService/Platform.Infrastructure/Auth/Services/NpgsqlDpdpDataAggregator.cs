using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// DG-SEC-04: Reads personal data across all non-auth schemas (document, gst, loan, itr,
/// accounting, chat, callback) using raw Npgsql so that Platform.Infrastructure avoids
/// cross-project references to FinanceService/AssistService DbContext types.
///
/// All composites share a single PostgreSQL database (schema-per-service isolation); this
/// approach is legitimate at the infrastructure layer. Only user-identifiable columns are
/// selected — no internal IDs beyond the row's own PK, no full ledger detail (DPDP right-
/// to-access requires personal data, not a complete audit ledger).
///
/// In local dev without Postgres (e.g. unit-test runs where no connection string is
/// configured), <see cref="AggregateAsync"/> returns an empty bundle without throwing.
/// </summary>
public sealed class NpgsqlDpdpDataAggregator(
    IConfiguration configuration,
    ILogger<NpgsqlDpdpDataAggregator> logger) : IDpdpDataAggregator
{
    /// <inheritdoc />
    public async Task<DpdpCrossSchemaBundle> AggregateAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        var connStr = ResolveConnectionString();
        if (connStr is null)
        {
            logger.LogWarning(
                "NpgsqlDpdpDataAggregator: no connection string configured — " +
                "cross-schema DPDP data will be empty for user {UserId}.", userId);
            return EmptyBundle();
        }

        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync(ct);

        logger.LogInformation(
            "NpgsqlDpdpDataAggregator: aggregating cross-schema DPDP data for user {UserId}.", userId);

        var documents      = await ReadDocumentsAsync(conn, userId, ct);
        var gstReturns     = await ReadGstReturnsAsync(conn, userId, ct);
        var loans          = await ReadLoansAsync(conn, userId, ct);
        var itrFilings     = await ReadItrFilingsAsync(conn, userId, ct);
        var journalEntries = await ReadJournalEntriesAsync(conn, userId, ct);
        var chatThreads    = await ReadChatThreadsAsync(conn, userId, ct);
        var callbacks      = await ReadCallbacksAsync(conn, userId, ct);

        logger.LogInformation(
            "NpgsqlDpdpDataAggregator: completed aggregation for user {UserId} — " +
            "docs={Docs}, gstReturns={Gst}, loans={Loans}, itr={Itr}, " +
            "journalEntries={JE}, chatThreads={Chat}, callbacks={CB}.",
            userId,
            documents.Count, gstReturns.Count, loans.Count, itrFilings.Count,
            journalEntries.Count, chatThreads.Count, callbacks.Count);

        return new DpdpCrossSchemaBundle(
            documents, gstReturns, loans, itrFilings,
            journalEntries, chatThreads, callbacks);
    }

    // ─── document.documents ─────────────────────────────────────────────────

    private static async Task<List<DpdpDocumentRow>> ReadDocumentsAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT id, original_file_name, status, mime_type, created_at
            FROM   document.documents
            WHERE  user_id = @userId
              AND  deleted_at IS NULL
              AND  anonymized_at IS NULL
            ORDER  BY created_at DESC
            LIMIT  500
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpDocumentRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpDocumentRow(
                Id:               reader.GetGuid(0),
                OriginalFileName: reader.IsDBNull(1) ? null : reader.GetString(1),
                Status:           reader.IsDBNull(2) ? null : reader.GetString(2),
                MimeType:         reader.IsDBNull(3) ? null : reader.GetString(3),
                UploadedAt:       reader.GetDateTime(4)));
        }

        return rows;
    }

    // ─── gst.gst_return ─────────────────────────────────────────────────────
    // Table: gst.gst_return (singular). Joined via auth.organization_member.
    // Period represented as financial_year + period_month (no single tax_period column).

    private static async Task<List<DpdpGstReturnRow>> ReadGstReturnsAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT gr.id, gr.return_type, gr.financial_year, gr.period_month,
                   gr.status, gr.total_taxable_value, gr.net_tax_payable, gr.created_at
            FROM   gst.gst_return gr
            JOIN   auth.organization_member om
                ON om.organization_id = gr.organization_id
               AND om.is_active = TRUE
               AND om.deleted_at IS NULL
            WHERE  om.user_id = @userId
              AND  gr.deleted_at IS NULL
            ORDER  BY gr.created_at DESC
            LIMIT  200
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpGstReturnRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var fy     = reader.GetString(2);
            var month  = reader.IsDBNull(3) ? (short?)null : reader.GetInt16(3);
            var period = month.HasValue ? $"{fy} M{month}" : fy;

            rows.Add(new DpdpGstReturnRow(
                Id:                reader.GetGuid(0),
                ReturnType:        reader.GetString(1),
                TaxPeriod:         period,
                Status:            reader.GetString(4),
                TotalTaxableValue: reader.IsDBNull(5) ? 0m : reader.GetDecimal(5),
                NetTaxPayable:     reader.IsDBNull(6) ? 0m : reader.GetDecimal(6),
                CreatedAt:         reader.GetDateTime(7)));
        }

        return rows;
    }

    // ─── loan.loan_application ───────────────────────────────────────────────
    // user_id column is directly on loan_application (not just via org membership).

    private static async Task<List<DpdpLoanRow>> ReadLoansAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT id, status, requested_amount, purpose, created_at
            FROM   loan.loan_application
            WHERE  user_id = @userId
              AND  deleted_at IS NULL
            ORDER  BY created_at DESC
            LIMIT  100
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpLoanRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpLoanRow(
                Id:          reader.GetGuid(0),
                Status:      reader.GetString(1),
                LoanAmount:  reader.IsDBNull(2) ? 0m : reader.GetDecimal(2),
                Purpose:     reader.IsDBNull(3) ? null : reader.GetString(3),
                CreatedAt:   reader.GetDateTime(4)));
        }

        return rows;
    }

    // ─── itr.filings ────────────────────────────────────────────────────────
    // user_id column is directly on itr.filings. Assessment year column is "ay".

    private static async Task<List<DpdpItrFilingRow>> ReadItrFilingsAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT id, ay, itr_form, status, total_income, created_at
            FROM   itr.filings
            WHERE  user_id = @userId
              AND  deleted_at IS NULL
            ORDER  BY created_at DESC
            LIMIT  100
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpItrFilingRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpItrFilingRow(
                Id:             reader.GetGuid(0),
                AssessmentYear: reader.GetString(1),
                ItrForm:        reader.GetString(2),
                Status:         reader.GetString(3),
                TotalIncome:    reader.IsDBNull(4) ? null : reader.GetDecimal(4),
                CreatedAt:      reader.GetDateTime(5)));
        }

        return rows;
    }

    // ─── accounting.journal_entry ────────────────────────────────────────────
    // Org-scoped; join via auth.organization_member.
    // Columns: entry_type, entry_date, total_debit, notes (not "amount"/"narration").

    private static async Task<List<DpdpJournalEntryRow>> ReadJournalEntriesAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT je.id, je.entry_type, je.entry_date,
                   je.total_debit, je.notes, je.created_at
            FROM   accounting.journal_entry je
            JOIN   auth.organization_member om
                ON om.organization_id = je.organization_id
               AND om.is_active = TRUE
               AND om.deleted_at IS NULL
            WHERE  om.user_id = @userId
              AND  je.deleted_at IS NULL
            ORDER  BY je.created_at DESC
            LIMIT  500
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpJournalEntryRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpJournalEntryRow(
                Id:        reader.GetGuid(0),
                EntryType: reader.GetString(1),
                EntryDate: reader.GetDateTime(2),
                Amount:    reader.IsDBNull(3) ? 0m : reader.GetDecimal(3),
                Narration: reader.IsDBNull(4) ? null : reader.GetString(4),
                CreatedAt: reader.GetDateTime(5)));
        }

        return rows;
    }

    // ─── chat.threads ────────────────────────────────────────────────────────
    // user_id column is on chat.threads directly (the customer who opened the thread).
    // Counts messages from chat.messages (not chat.message).

    private static async Task<List<DpdpChatThreadRow>> ReadChatThreadsAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT t.id, t.subject, t.status,
                   COUNT(m.id) AS message_count,
                   t.created_at
            FROM   chat.threads t
            LEFT   JOIN chat.messages m
                ON m.thread_id = t.id
               AND m.deleted_at IS NULL
            WHERE  t.user_id = @userId
              AND  t.deleted_at IS NULL
            GROUP  BY t.id, t.subject, t.status, t.created_at
            ORDER  BY t.created_at DESC
            LIMIT  200
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpChatThreadRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpChatThreadRow(
                ThreadId:     reader.GetGuid(0),
                Subject:      reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                Status:       reader.GetString(2),
                MessageCount: (int)reader.GetInt64(3),
                CreatedAt:    reader.GetDateTime(4)));
        }

        return rows;
    }

    // ─── callback.callbacks ──────────────────────────────────────────────────
    // scheduled_at is a TSTZRANGE — emit as a string for the JSON bundle.

    private static async Task<List<DpdpCallbackRow>> ReadCallbacksAsync(
        NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        const string sql = """
            SELECT id, category, status,
                   LOWER(scheduled_at)::TEXT AS scheduled_from,
                   created_at
            FROM   callback.callbacks
            WHERE  user_id = @userId
              AND  deleted_at IS NULL
            ORDER  BY created_at DESC
            LIMIT  200
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("userId", userId);

        var rows = new List<DpdpCallbackRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new DpdpCallbackRow(
                Id:            reader.GetGuid(0),
                Category:      reader.GetString(1),
                Status:        reader.GetString(2),
                ScheduledSlot: reader.IsDBNull(3) ? null : reader.GetString(3),
                CreatedAt:     reader.GetDateTime(4)));
        }

        return rows;
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private string? ResolveConnectionString()
    {
        var cs = configuration.GetConnectionString("DefaultConnection")
              ?? configuration.GetConnectionString("snapaccount");

        if (string.IsNullOrWhiteSpace(cs))
            return null;

        // Apply the #{DB_PASSWORD}# placeholder substitution used across the project.
        var password = configuration["DB_PASSWORD"] ?? "postgresql";
        return cs.Replace("#{DB_PASSWORD}#", password);
    }

    private static DpdpCrossSchemaBundle EmptyBundle() =>
        new([], [], [], [], [], [], []);
}
