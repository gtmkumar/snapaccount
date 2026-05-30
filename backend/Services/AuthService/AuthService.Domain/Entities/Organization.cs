using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class Organization : BaseAuditableEntity
{
    public Guid OwnerUserId { get; init; }
    public string BusinessName { get; init; } = string.Empty;
    public string? Gstin { get; init; }
    public string? PanNumber { get; init; }
    public string? BusinessType { get; private set; }
    public string? IndustryType { get; private set; }
    public decimal? AnnualTurnoverInr { get; private set; }
    public DateOnly? RegistrationDate { get; private set; }
    public string? AddressLine1 { get; private set; }
    public string? AddressLine2 { get; private set; }
    public string? City { get; private set; }
    public string? State { get; private set; }
    public string? Pincode { get; private set; }
    public string Country { get; private set; } = "India";
    public bool IsGstRegistered { get; init; }
    public bool IsMsmeRegistered { get; private set; }
    public string? MsmeUdyamNumber { get; private set; }
    public string? LogoUrl { get; private set; }
    public bool IsActive { get; private set; } = true;

    private readonly List<OrganizationMember> _members = [];
    public IReadOnlyCollection<OrganizationMember> Members => _members.AsReadOnly();

    /// <summary>
    /// Sets optional classification fields that cannot be provided via object-initialiser
    /// because they have private setters (they may be updated independently of identity fields).
    /// Call immediately after construction before persisting.
    /// BUG-ORG-BUSINESSTYPE: BusinessType/IndustryType/AnnualTurnoverInr were silently dropped
    /// because the handler used an object-initialiser which cannot reach private setters.
    /// </summary>
    public void SetBusinessDetails(
        string? businessType,
        string? industryType,
        decimal? annualTurnoverInr)
    {
        BusinessType      = businessType;
        IndustryType      = industryType;
        AnnualTurnoverInr = annualTurnoverInr;
    }
}
