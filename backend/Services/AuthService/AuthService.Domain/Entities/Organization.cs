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

    /// <summary>
    /// When true, every document kind (PAN/AADHAAR/GSTIN/TAN) requires OTP-based
    /// government verification before the record moves to VERIFIED status.
    /// Mapped to <c>auth.organization.government_verification_enabled</c> (migration 053).
    /// </summary>
    public bool GovernmentVerificationEnabled { get; private set; }

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

    /// <summary>
    /// Enables or disables mandatory government (OTP-based) verification for all document
    /// kinds in this organization. Idempotent — safe to call with the current value.
    /// </summary>
    /// <param name="enabled">True to require OTP verification; false to allow SAVED status.</param>
    public void SetGovernmentVerification(bool enabled)
    {
        GovernmentVerificationEnabled = enabled;
    }

    /// <summary>
    /// Updates mutable self-service settings (address, logo URL).
    /// Identity-critical fields (BusinessName, Gstin, PanNumber) are intentionally excluded —
    /// those require a KYC re-verification flow.
    /// </summary>
    public void UpdateSettings(
        string? logoUrl,
        string? addressLine1,
        string? addressLine2,
        string? city,
        string? state,
        string? pincode)
    {
        if (logoUrl     is not null) LogoUrl      = logoUrl;
        if (addressLine1 is not null) AddressLine1 = addressLine1;
        if (addressLine2 is not null) AddressLine2 = addressLine2;
        if (city        is not null) City         = city;
        if (state       is not null) State        = state;
        if (pincode     is not null) Pincode      = pincode;
    }
}
