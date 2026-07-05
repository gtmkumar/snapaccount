using AccountingService.Application.Interfaces;
using Dapper;
using Microsoft.EntityFrameworkCore;

namespace AccountingService.Infrastructure.Persistence.Repositories;

/// <summary>
/// Reads COA template rows directly from <c>accounting.coa_template</c> using Dapper
/// (read-only table owned by db-engineer; no EF entity needed).
/// P6-HANDOFF-02.
/// </summary>
public sealed class CoaTemplateRepository(AccountingDbContext dbContext) : ICoaTemplateRepository
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<CoaTemplateRow>> GetAllTemplatesAsync(CancellationToken ct = default)
    {
        var connection = dbContext.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
            await connection.OpenAsync(ct);

        // BUG-ACCT-COA-TEMPLATE-CODE: accounting.coa_template (migration 016) has NO template_code
        // column — account_code is the identifying column. Selecting template_code 42703'd on every
        // bootstrap-coa call. There is only one seeded (Indian-standard) template, so the multi-template
        // TemplateCode field was dead design; dropped from CoaTemplateRow and this query.
        var results = await connection.QueryAsync<CoaTemplateRow>(
            "SELECT account_code AS AccountCode, " +
            "account_name AS AccountName, account_type AS AccountType, " +
            "account_subtype AS AccountSubtype, parent_code AS ParentCode " +
            "FROM accounting.coa_template ORDER BY account_code");

        return results.ToList().AsReadOnly();
    }
}
