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

        var results = await connection.QueryAsync<CoaTemplateRow>(
            "SELECT template_code AS TemplateCode, account_code AS AccountCode, " +
            "account_name AS AccountName, account_type AS AccountType, " +
            "account_subtype AS AccountSubtype, parent_code AS ParentCode " +
            "FROM accounting.coa_template ORDER BY account_code");

        return results.ToList().AsReadOnly();
    }
}
