namespace AccountingService.Application.Interfaces;

/// <summary>
/// Read-only repository for COA template rows seeded into <c>accounting.coa_template</c>.
/// Templates are system-owned (is_system=TRUE) and have no org_id.
/// Used by <see cref="Organizations.Commands.BootstrapCoa.BootstrapOrganizationChartOfAccountsCommandHandler"/>
/// to materialise per-org accounts. P6-HANDOFF-02.
/// </summary>
public interface ICoaTemplateRepository
{
    /// <summary>Returns all COA template rows ordered by account code.</summary>
    Task<IReadOnlyList<CoaTemplateRow>> GetAllTemplatesAsync(CancellationToken ct = default);
}

/// <summary>Flat DTO representing one row from <c>accounting.coa_template</c>.</summary>
/// <remarks>
/// BUG-ACCT-COA-TEMPLATE-CODE: the real table has no template_code column (only one seeded
/// template exists); the account_code is the natural template identifier used for traceability.
/// </remarks>
public record CoaTemplateRow(
    string AccountCode,
    string AccountName,
    string AccountType,
    string? AccountSubtype,
    string? ParentCode);
