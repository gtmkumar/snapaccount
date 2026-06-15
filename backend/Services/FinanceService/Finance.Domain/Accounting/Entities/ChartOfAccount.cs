using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// Per-org chart of accounts entry, materialised from <c>accounting.coa_template</c>
/// seeds into <c>accounting.account</c> during org bootstrap.
/// P6-HANDOFF-02: <see cref="OrgId"/> is NOT NULL; template seeds cannot live here.
/// </summary>
public class ChartOfAccount : BaseAuditableEntity
{
    /// <summary>Organisation that owns this account. NOT NULL per schema constraint.</summary>
    public Guid OrgId { get; private set; }

    /// <summary>Hierarchical account code (e.g. 1001, 2100, 4500).</summary>
    public string AccountCode { get; private set; } = string.Empty;

    /// <summary>Display name of the account.</summary>
    public string AccountName { get; private set; } = string.Empty;

    /// <summary>ASSET, LIABILITY, EQUITY, INCOME, EXPENSE.</summary>
    public string AccountType { get; private set; } = string.Empty;

    /// <summary>Optional sub-classification (e.g. CURRENT_ASSET, FIXED_ASSET).</summary>
    public string? AccountSubtype { get; private set; }

    /// <summary>Parent account for hierarchical COA structure.</summary>
    public Guid? ParentAccountId { get; private set; }

    /// <summary>Whether the account accepts direct postings (false = summary/group account).</summary>
    public bool IsPostable { get; private set; } = true;

    /// <summary>Whether this account was materialised from a COA template.</summary>
    public bool IsFromTemplate { get; private set; }

    /// <summary>Source template code for traceability.</summary>
    public string? TemplateCode { get; private set; }

    /// <summary>Whether the account is active.</summary>
    public bool IsActive { get; private set; } = true;

    private ChartOfAccount() { }

    /// <summary>Creates a per-org chart of accounts entry from a COA template row.</summary>
    public static ChartOfAccount CreateFromTemplate(
        Guid orgId,
        string accountCode,
        string accountName,
        string accountType,
        string? accountSubtype = null,
        Guid? parentAccountId = null,
        string? templateCode = null)
    {
        return new ChartOfAccount
        {
            OrgId = orgId,
            AccountCode = accountCode,
            AccountName = accountName,
            AccountType = accountType,
            AccountSubtype = accountSubtype,
            ParentAccountId = parentAccountId,
            IsFromTemplate = true,
            TemplateCode = templateCode
        };
    }

    /// <summary>Creates a custom account directly for an org (not from template).</summary>
    public static ChartOfAccount Create(
        Guid orgId,
        string accountCode,
        string accountName,
        string accountType,
        string? accountSubtype = null,
        Guid? parentAccountId = null)
    {
        return new ChartOfAccount
        {
            OrgId = orgId,
            AccountCode = accountCode,
            AccountName = accountName,
            AccountType = accountType,
            AccountSubtype = accountSubtype,
            ParentAccountId = parentAccountId
        };
    }
}
