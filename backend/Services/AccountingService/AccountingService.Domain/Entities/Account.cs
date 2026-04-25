using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

public class Account : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? ParentAccountId { get; private set; }
    public string AccountCode { get; private set; } = string.Empty;
    public string AccountName { get; private set; } = string.Empty;
    public string AccountType { get; private set; } = string.Empty; // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    public string? AccountSubtype { get; private set; }
    public string Currency { get; private set; } = "INR";
    public bool IsActive { get; private set; } = true;
    public bool IsSystemAccount { get; private set; }
    public string? Description { get; private set; }

    private Account() { }

    public static Account Create(Guid orgId, string code, string name, string accountType, bool isSystem = false)
        => new() { OrganizationId = orgId, AccountCode = code, AccountName = name, AccountType = accountType, IsSystemAccount = isSystem };
}
